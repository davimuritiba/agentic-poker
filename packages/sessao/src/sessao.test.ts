import { describe, expect, it } from 'vitest';
import {
  NOME_DO_COOKIE,
  assinarSessao,
  lerCookie,
  lerSessaoDoCookie,
  segredoDaSessao,
  verificarSessao,
} from './index.js';

const SEGREDO = 'um-segredo-de-teste-com-mais-de-32-caracteres';
const DADOS = { usuarioId: '3f2b7c1e-9d4a-4b8e-a1c2-123456789abc', apelido: 'Davi' };
const AGORA = Date.UTC(2026, 10, 12);

describe('assinarSessao / verificarSessao', () => {
  it('devolve os dados de um token válido', () => {
    const token = assinarSessao(DADOS, SEGREDO, { agora: AGORA });
    expect(verificarSessao(token, SEGREDO, AGORA + 1000)).toEqual(DADOS);
  });

  it('rejeita token expirado', () => {
    const token = assinarSessao(DADOS, SEGREDO, { agora: AGORA, validadeS: 60 });
    expect(verificarSessao(token, SEGREDO, AGORA + 61_000)).toBeNull();
  });

  it('rejeita token assinado com outro segredo', () => {
    const token = assinarSessao(DADOS, 'outro-segredo-qualquer-com-32-caracteres!', {
      agora: AGORA,
    });
    expect(verificarSessao(token, SEGREDO, AGORA)).toBeNull();
  });

  it('rejeita token com o conteúdo alterado', () => {
    const [cabecalho, , assinatura] = assinarSessao(DADOS, SEGREDO, { agora: AGORA }).split('.');
    const corpoFalso = Buffer.from(
      JSON.stringify({ sub: 'outro-usuario', apelido: 'Hacker', exp: AGORA / 1000 + 3600 }),
    ).toString('base64url');
    expect(verificarSessao(`${cabecalho}.${corpoFalso}.${assinatura}`, SEGREDO, AGORA)).toBeNull();
  });

  it('rejeita "alg: none" e lixo', () => {
    const [, corpo] = assinarSessao(DADOS, SEGREDO, { agora: AGORA }).split('.');
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verificarSessao(`${none}.${corpo}.`, SEGREDO, AGORA)).toBeNull();
    expect(verificarSessao('abc', SEGREDO, AGORA)).toBeNull();
    expect(verificarSessao('', SEGREDO, AGORA)).toBeNull();
  });
});

describe('lerCookie', () => {
  it('encontra o cookie entre outros', () => {
    expect(lerCookie('a=1; poker_sessao=abc.def; b=2', NOME_DO_COOKIE)).toBe('abc.def');
    expect(lerCookie('a=1', NOME_DO_COOKIE)).toBeNull();
    expect(lerCookie(undefined, NOME_DO_COOKIE)).toBeNull();
  });

  it('lê a sessão direto do cabeçalho', () => {
    const token = assinarSessao(DADOS, SEGREDO, { agora: AGORA });
    expect(lerSessaoDoCookie(`x=y; ${NOME_DO_COOKIE}=${token}`, SEGREDO, AGORA)).toEqual(DADOS);
  });
});

describe('segredoDaSessao', () => {
  it('usa AUTH_SEGREDO quando definido', () => {
    expect(segredoDaSessao({ AUTH_SEGREDO: SEGREDO })).toBe(SEGREDO);
  });

  it('exige segredo longo', () => {
    expect(() => segredoDaSessao({ AUTH_SEGREDO: 'curto' })).toThrow();
  });

  it('exige segredo em produção', () => {
    expect(() => segredoDaSessao({ NODE_ENV: 'production' })).toThrow();
    expect(segredoDaSessao({})).toMatch(/desenvolvimento/);
  });
});
