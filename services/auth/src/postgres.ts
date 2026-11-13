/**
 * Contas no Postgres. As migrações rodam ao subir o serviço, em ordem, e cada uma só
 * uma vez (a tabela `migracoes` guarda quais já rodaram).
 */
import pg from 'pg';
import { JaCadastrado, type NovoUsuario, type Usuarios, type UsuarioGuardado } from './usuarios.js';

const MIGRACOES: readonly string[] = [
  `CREATE TABLE usuarios (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email        text NOT NULL,
     apelido      text NOT NULL,
     hash_senha   text NOT NULL,
     criado_em    timestamptz NOT NULL DEFAULT now()
   );
   CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));
   CREATE UNIQUE INDEX usuarios_apelido_unico ON usuarios (lower(apelido));`,
];

export async function migrar(pool: pg.Pool): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Trava para duas instâncias não migrarem ao mesmo tempo.
    await cliente.query('SELECT pg_advisory_xact_lock(7201)');
    await cliente.query(
      `CREATE TABLE IF NOT EXISTS migracoes (
         versao      integer PRIMARY KEY,
         aplicada_em timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await cliente.query<{ versao: number }>('SELECT versao FROM migracoes');
    const aplicadas = new Set(rows.map((r) => r.versao));
    for (const [i, sql] of MIGRACOES.entries()) {
      const versao = i + 1;
      if (aplicadas.has(versao)) continue;
      await cliente.query(sql);
      await cliente.query('INSERT INTO migracoes (versao) VALUES ($1)', [versao]);
      console.log(`[auth] migração ${versao} aplicada`);
    }
    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

interface Linha {
  id: string;
  email: string;
  apelido: string;
  hash_senha: string;
}

const paraUsuario = (l: Linha): UsuarioGuardado => ({
  id: l.id,
  email: l.email,
  apelido: l.apelido,
  hashDaSenha: l.hash_senha,
});

const COLUNAS = 'id, email, apelido, hash_senha';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UsuariosNoPostgres implements Usuarios {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async criar(novo: NovoUsuario): Promise<UsuarioGuardado> {
    try {
      const { rows } = await this.pool.query<Linha>(
        `INSERT INTO usuarios (email, apelido, hash_senha) VALUES ($1, $2, $3) RETURNING ${COLUNAS}`,
        [novo.email, novo.apelido, novo.hashDaSenha],
      );
      return paraUsuario(rows[0]!);
    } catch (erro) {
      const { code, constraint } = erro as { code?: string; constraint?: string };
      if (code === '23505') {
        throw new JaCadastrado(constraint === 'usuarios_apelido_unico' ? 'apelido' : 'email');
      }
      throw erro;
    }
  }

  async buscarPorEmail(email: string): Promise<UsuarioGuardado | null> {
    const { rows } = await this.pool.query<Linha>(
      `SELECT ${COLUNAS} FROM usuarios WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0] ? paraUsuario(rows[0]) : null;
  }

  async buscarPorId(id: string): Promise<UsuarioGuardado | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<Linha>(`SELECT ${COLUNAS} FROM usuarios WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? paraUsuario(rows[0]) : null;
  }
}
