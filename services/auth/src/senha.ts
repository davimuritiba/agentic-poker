/**
 * Hash de senhas com scrypt (node:crypto), com sal aleatório por senha.
 * Formato guardado no banco: scrypt$<logN>$<r>$<p>$<sal base64>$<hash base64>
 * Os parâmetros ficam junto do hash para poderem subir no futuro sem invalidar contas antigas.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const LOG_N = 15; // N = 32768
const R = 8;
const P = 1;
const TAMANHO_DO_HASH = 64;

function derivar(senha: string, sal: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize('NFKC'), sal, TAMANHO_DO_HASH, opcoes, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    );
  });
}

const opcoesPara = (logN: number, r: number, p: number): ScryptOptions => ({
  N: 2 ** logN,
  r,
  p,
  maxmem: 256 * 2 ** logN * r + 1024 * 1024,
});

export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal, opcoesPara(LOG_N, R, P));
  return ['scrypt', LOG_N, R, P, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, logN, r, p, sal, hash] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const obtido = await derivar(
    senha,
    Buffer.from(sal, 'base64'),
    opcoesPara(Number(logN), Number(r), Number(p)),
  );
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

/**
 * Hash de uma senha qualquer, usado quando o e-mail não existe: o login leva o mesmo tempo
 * com ou sem conta, então não dá para descobrir quais e-mails estão cadastrados pelo tempo.
 */
export const HASH_DE_MENTIRA = gerarHash(randomBytes(16).toString('hex'));
