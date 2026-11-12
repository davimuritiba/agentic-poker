import { NOME_DO_COOKIE, assinarSessao } from '@poker/sessao';
import { describe, expect, it } from 'vitest';
import { identificacaoDoCookie, lerAcao, lerIdentificacao } from './entrada.js';

const ID = '3f2b7c1e-9d4a-4b8e-a1c2-123456789abc';

describe('lerIdentificacao', () => {
  it('aceita id e nome válidos, limpando espaços', () => {
    expect(lerIdentificacao({ jogadorId: ID, nome: '  Davi   M  ' })).toEqual({
      jogadorId: ID,
      nome: 'Davi M',
    });
  });

  it('corta nomes longos em 20 caracteres', () => {
    expect(lerIdentificacao({ jogadorId: ID, nome: 'x'.repeat(50) })?.nome).toHaveLength(20);
  });

  it.each([
    ['sem dados', undefined],
    ['id curto', { jogadorId: 'abc', nome: 'Davi' }],
    ['id com caracteres estranhos', { jogadorId: '<script>alert(1)</script>', nome: 'Davi' }],
    ['id de bot', { jogadorId: `bot-${ID}`, nome: 'Davi' }],
    ['nome vazio', { jogadorId: ID, nome: '   ' }],
    ['nome fingindo ser bot', { jogadorId: ID, nome: 'Ada (bot)' }],
    ['nome que não é texto', { jogadorId: ID, nome: 42 }],
  ])('rejeita %s', (_nome, auth) => {
    expect(lerIdentificacao(auth)).toBeNull();
  });
});

describe('identificacaoDoCookie', () => {
  const SEGREDO = 'um-segredo-de-teste-com-mais-de-32-caracteres';
  const token = assinarSessao({ usuarioId: ID, apelido: 'Davi' }, SEGREDO);

  it('identifica o jogador pela sessão', () => {
    expect(identificacaoDoCookie(`${NOME_DO_COOKIE}=${token}`, SEGREDO)).toEqual({
      jogadorId: ID,
      nome: 'Davi',
    });
  });

  it('recusa sem cookie ou com segredo diferente', () => {
    expect(identificacaoDoCookie(undefined, SEGREDO)).toBeNull();
    expect(
      identificacaoDoCookie(
        `${NOME_DO_COOKIE}=${token}`,
        'outro-segredo-com-mais-de-32-caracteres',
      ),
    ).toBeNull();
  });
});

describe('lerAcao', () => {
  it('aceita ações bem formadas e descarta campos extras', () => {
    expect(lerAcao({ tipo: 'pagar', valor: 999, extra: true })).toEqual({ tipo: 'pagar' });
    expect(lerAcao({ tipo: 'aumentar', valor: 300 })).toEqual({ tipo: 'aumentar', valor: 300 });
  });

  it.each([
    null,
    'pagar',
    { tipo: 'roubar' },
    { tipo: 'apostar' },
    { tipo: 'apostar', valor: '300' },
  ])('rejeita %o', (dado) => {
    expect(lerAcao(dado)).toBeNull();
  });
});
