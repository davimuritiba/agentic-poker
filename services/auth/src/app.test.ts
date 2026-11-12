import { NOME_DO_COOKIE, verificarSessao } from '@poker/sessao';
import { describe, expect, it } from 'vitest';
import { ERRO_DE_JSON, criarApp, type Pedido, type Resultado } from './app.js';
import { LimiteDeTentativas } from './limite.js';
import { conferirSenha } from './senha.js';
import { UsuariosEmMemoria } from './usuarios.js';

const SEGREDO = 'um-segredo-de-teste-com-mais-de-32-caracteres';
const JSON_ = 'application/json';

function montar(limite?: LimiteDeTentativas) {
  const usuarios = new UsuariosEmMemoria();
  const tratar = criarApp({ usuarios, segredo: SEGREDO, limite });
  const post = (caminho: string, corpo: unknown, extra: Partial<Pedido> = {}) =>
    tratar({ metodo: 'POST', caminho, ip: '1.2.3.4', tipoDoConteudo: JSON_, corpo, ...extra });
  const eu = (cookie?: string) =>
    tratar({ metodo: 'GET', caminho: '/api/auth/eu', ip: '1.2.3.4', cookie });
  return { usuarios, tratar, post, eu };
}

const NOVO = { email: ' Davi@Exemplo.com ', apelido: 'Davi', senha: 'senha-forte-123' };

/** Converte o Set-Cookie da resposta no cabeçalho Cookie que o navegador mandaria. */
const cookieDe = (r: Resultado) => r.cookie?.split(';')[0];

describe('cadastro', () => {
  it('cria a conta, devolve o usuário sem senha e já deixa logado', async () => {
    const { post, usuarios } = montar();
    const r = await post('/api/auth/cadastro', NOVO);

    expect(r.status).toBe(201);
    expect(r.corpo).toEqual({
      ok: true,
      usuario: { id: expect.any(String), email: 'davi@exemplo.com', apelido: 'Davi' },
    });
    expect(JSON.stringify(r.corpo)).not.toContain('senha');
    expect(r.cookie).toMatch(/HttpOnly/);
    expect(r.cookie).toMatch(/SameSite=Lax/);

    const token = cookieDe(r)!.slice(NOME_DO_COOKIE.length + 1);
    const guardado = await usuarios.buscarPorEmail('davi@exemplo.com');
    expect(verificarSessao(token, SEGREDO)).toEqual({ usuarioId: guardado!.id, apelido: 'Davi' });
    expect(guardado!.hashDaSenha).not.toContain(NOVO.senha);
    expect(await conferirSenha(NOVO.senha, guardado!.hashDaSenha)).toBe(true);
  });

  it('recusa e-mail repetido (sem diferenciar maiúsculas)', async () => {
    const { post } = montar();
    await post('/api/auth/cadastro', NOVO);
    const r = await post('/api/auth/cadastro', {
      ...NOVO,
      email: 'DAVI@exemplo.com',
      apelido: 'Outro',
    });
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ ok: false, campo: 'email' });
  });

  it('recusa apelido repetido (sem diferenciar maiúsculas)', async () => {
    const { post } = montar();
    await post('/api/auth/cadastro', NOVO);
    const r = await post('/api/auth/cadastro', {
      ...NOVO,
      email: 'outro@exemplo.com',
      apelido: 'DAVI',
    });
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ ok: false, campo: 'apelido' });
  });

  it.each([
    ['e-mail inválido', { ...NOVO, email: 'davi' }, 'email'],
    ['apelido curto', { ...NOVO, apelido: 'Da' }, 'apelido'],
    ['apelido com símbolos', { ...NOVO, apelido: '<script>' }, 'apelido'],
    ['apelido de bot', { ...NOVO, apelido: 'Ada bot' }, 'apelido'],
    ['senha curta', { ...NOVO, senha: '1234567' }, 'senha'],
    ['senha ausente', { email: NOVO.email, apelido: 'Davi' }, 'senha'],
  ])('recusa %s', async (_caso, corpo, campo) => {
    const r = await montar().post('/api/auth/cadastro', corpo);
    expect(r.status).toBe(400);
    expect(r.corpo).toMatchObject({ ok: false, campo });
  });
});

describe('login', () => {
  it('entra com e-mail e senha corretos', async () => {
    const { post } = montar();
    await post('/api/auth/cadastro', NOVO);
    const r = await post('/api/auth/login', { email: 'davi@exemplo.com', senha: NOVO.senha });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, usuario: { apelido: 'Davi' } });
    expect(r.cookie).toContain(`${NOME_DO_COOKIE}=`);
  });

  it('dá a mesma resposta para senha errada e e-mail inexistente', async () => {
    const { post } = montar();
    await post('/api/auth/cadastro', NOVO);
    const senhaErrada = await post('/api/auth/login', { email: NOVO.email, senha: 'errada-123' });
    const semConta = await post('/api/auth/login', { email: 'x@y.com', senha: 'errada-123' });
    expect(senhaErrada).toEqual(semConta);
    expect(senhaErrada.status).toBe(401);
    expect(senhaErrada.cookie).toBeUndefined();
  });

  it('bloqueia depois de tentativas demais do mesmo IP', async () => {
    const { post } = montar(new LimiteDeTentativas(2, 60_000));
    await post('/api/auth/login', { email: 'x@y.com', senha: 'a' });
    await post('/api/auth/login', { email: 'x@y.com', senha: 'a' });
    const r = await post('/api/auth/login', { email: 'x@y.com', senha: 'a' });
    expect(r.status).toBe(429);
    const deOutroIp = await post(
      '/api/auth/login',
      { email: 'x@y.com', senha: 'a' },
      { ip: '9.9.9.9' },
    );
    expect(deOutroIp.status).toBe(401);
  });
});

describe('sessão', () => {
  it('/eu devolve o usuário do cookie e logout apaga o cookie', async () => {
    const { post, eu } = montar();
    const cadastro = await post('/api/auth/cadastro', NOVO);

    const r = await eu(cookieDe(cadastro));
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, usuario: { apelido: 'Davi' } });

    const saida = await post('/api/auth/logout', {});
    expect(saida.cookie).toMatch(new RegExp(`^${NOME_DO_COOKIE}=;.*Max-Age=0`));
  });

  it('/eu recusa sem cookie ou com cookie forjado', async () => {
    const { eu } = montar();
    expect((await eu()).status).toBe(401);
    const forjado = await eu(`${NOME_DO_COOKIE}=abc.def.ghi`);
    expect(forjado.status).toBe(401);
    expect(forjado.cookie).toBeUndefined();
  });
});

describe('proteções do protocolo', () => {
  it('exige JSON nos POST (barra formulários de outros sites)', async () => {
    const r = await montar().post('/api/auth/login', NOVO, { tipoDoConteudo: 'text/plain' });
    expect(r.status).toBe(415);
  });

  it('recusa JSON inválido, método errado e rota desconhecida', async () => {
    const { post, tratar } = montar();
    expect((await post('/api/auth/login', ERRO_DE_JSON)).status).toBe(400);
    expect(
      (await tratar({ metodo: 'GET', caminho: '/api/auth/login', ip: '1.2.3.4' })).status,
    ).toBe(405);
    expect((await tratar({ metodo: 'GET', caminho: '/nada', ip: '1.2.3.4' })).status).toBe(404);
  });
});
