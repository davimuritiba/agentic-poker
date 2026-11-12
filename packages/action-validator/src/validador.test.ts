import type { Acao } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { acoesPermitidas } from './permitidas.js';
import { conferirSituacao, type SituacaoDeAposta } from './situacao.js';
import { validarAcao, type EfeitoDaAcao } from './validador.js';

// Exemplos com blinds 50/100.
const situacao = (s: Partial<SituacaoDeAposta> = {}): SituacaoDeAposta => ({
  stack: 1000,
  apostaDoJogador: 0,
  maiorAposta: 100,
  aumentoMinimo: 100,
  podeAumentar: true,
  ...s,
});

function efeito(s: SituacaoDeAposta, acao: Acao): EfeitoDaAcao {
  const resultado = validarAcao(s, acao);
  if (!resultado.valida) throw new Error(`Esperava ação válida, veio: ${resultado.motivo}`);
  return resultado.efeito;
}

function motivo(s: SituacaoDeAposta, acao: Acao): string {
  const resultado = validarAcao(s, acao);
  if (resultado.valida) throw new Error('Esperava ação inválida');
  return resultado.motivo;
}

describe('acoesPermitidas', () => {
  it('pré-flop, primeiro a agir: desistir, pagar o big blind ou aumentar', () => {
    expect(acoesPermitidas(situacao())).toEqual({
      desistir: true,
      passar: false,
      pagar: 100,
      aumentar: { minimo: 200, maximo: 1000 },
      allIn: 1000,
    });
  });

  it('small blind paga só a diferença', () => {
    expect(acoesPermitidas(situacao({ apostaDoJogador: 50 })).pagar).toBe(50);
  });

  it('big blind sem aumento antes dele: pode passar ou aumentar', () => {
    const p = acoesPermitidas(situacao({ apostaDoJogador: 100 }));
    expect(p.passar).toBe(true);
    expect(p.pagar).toBeUndefined();
    expect(p.aumentar).toEqual({ minimo: 200, maximo: 1100 });
  });

  it('flop sem apostas: passar ou apostar a partir do big blind', () => {
    expect(acoesPermitidas(situacao({ maiorAposta: 0 }))).toEqual({
      desistir: true,
      passar: true,
      apostar: { minimo: 100, maximo: 1000 },
      allIn: 1000,
    });
  });

  it('o aumento mínimo acompanha o último aumento completo', () => {
    // Alguém aumentou de 100 para 300 (aumento de 200): o próximo vai no mínimo a 500.
    const p = acoesPermitidas(situacao({ maiorAposta: 300, aumentoMinimo: 200 }));
    expect(p.aumentar).toEqual({ minimo: 500, maximo: 1000 });
  });

  it('sem fichas para o aumento mínimo: só all-in por menos', () => {
    const p = acoesPermitidas(situacao({ stack: 150 }));
    expect(p.aumentar).toEqual({ minimo: 150, maximo: 150 });
  });

  it('sem fichas nem para pagar: pagar vira all-in pelo que tem, sem aumentar', () => {
    const p = acoesPermitidas(situacao({ stack: 80, maiorAposta: 300, aumentoMinimo: 200 }));
    expect(p).toEqual({ desistir: true, passar: false, pagar: 80, allIn: 80 });
  });

  it('ação não reaberta: só pagar ou desistir', () => {
    const p = acoesPermitidas(situacao({ podeAumentar: false }));
    expect(p).toEqual({ desistir: true, passar: false, pagar: 100 });
  });

  it('jogador já all-in não age', () => {
    expect(acoesPermitidas(situacao({ stack: 0 }))).toEqual({ desistir: false, passar: false });
  });
});

describe('validarAcao: efeitos', () => {
  it('pagar coloca a diferença e não reabre a ação', () => {
    expect(efeito(situacao({ apostaDoJogador: 50 }), { tipo: 'pagar' })).toEqual({
      tipo: 'pagar',
      fichasColocadas: 50,
      apostaTotal: 100,
      allIn: false,
      novaMaiorAposta: 100,
      novoAumentoMinimo: 100,
      reabreAcao: false,
    });
  });

  it('aumento completo atualiza o aumento mínimo e reabre a ação', () => {
    expect(efeito(situacao(), { tipo: 'aumentar', valor: 300 })).toMatchObject({
      fichasColocadas: 300,
      novaMaiorAposta: 300,
      novoAumentoMinimo: 200,
      reabreAcao: true,
    });
  });

  it('all-in menor que um aumento completo sobe a aposta, mas não reabre', () => {
    // Aposta de 100, jogador com 150: all-in "aumenta" só 50.
    expect(efeito(situacao({ stack: 150 }), { tipo: 'all-in' })).toEqual({
      tipo: 'aumentar',
      fichasColocadas: 150,
      apostaTotal: 150,
      allIn: true,
      novaMaiorAposta: 150,
      novoAumentoMinimo: 100,
      reabreAcao: false,
    });
  });

  it('all-in vira pagar, apostar ou aumentar conforme a situação', () => {
    expect(efeito(situacao({ stack: 60 }), { tipo: 'all-in' })).toMatchObject({
      tipo: 'pagar',
      allIn: true,
    });
    expect(efeito(situacao({ maiorAposta: 0 }), { tipo: 'all-in' })).toMatchObject({
      tipo: 'apostar',
      allIn: true,
      reabreAcao: true,
    });
    expect(efeito(situacao(), { tipo: 'all-in' })).toMatchObject({
      tipo: 'aumentar',
      allIn: true,
      reabreAcao: true,
    });
  });

  it('aposta all-in menor que o big blind não muda o aumento mínimo', () => {
    expect(
      efeito(situacao({ maiorAposta: 0, stack: 40 }), { tipo: 'apostar', valor: 40 }),
    ).toMatchObject({
      novaMaiorAposta: 40,
      novoAumentoMinimo: 100,
      reabreAcao: false,
      allIn: true,
    });
  });

  it('pagar exatamente o stack conta como all-in', () => {
    expect(efeito(situacao({ stack: 100 }), { tipo: 'pagar' }).allIn).toBe(true);
  });

  it('desistir e passar não colocam fichas', () => {
    expect(efeito(situacao(), { tipo: 'desistir' })).toMatchObject({
      fichasColocadas: 0,
      allIn: false,
    });
    expect(efeito(situacao({ maiorAposta: 0 }), { tipo: 'passar' })).toMatchObject({
      fichasColocadas: 0,
      allIn: false,
    });
  });
});

describe('validarAcao: jogadas ilegais', () => {
  it.each<[string, Partial<SituacaoDeAposta>, Acao, RegExp]>([
    ['passar com aposta a pagar', {}, { tipo: 'passar' }, /Não dá para passar: há 100 fichas/],
    ['pagar sem aposta', { maiorAposta: 0 }, { tipo: 'pagar' }, /Não há aposta a pagar/],
    ['apostar quando já há aposta', {}, { tipo: 'apostar', valor: 300 }, /Use aumentar/],
    ['aumentar sem aposta', { maiorAposta: 0 }, { tipo: 'aumentar', valor: 300 }, /Use apostar/],
    ['aumentar abaixo do mínimo', {}, { tipo: 'aumentar', valor: 150 }, /abaixo do mínimo \(200\)/],
    [
      'apostar abaixo do big blind',
      { maiorAposta: 0 },
      { tipo: 'apostar', valor: 50 },
      /mínimo \(100\)/,
    ],
    ['aumentar além do stack', {}, { tipo: 'aumentar', valor: 1001 }, /máximo possível \(1000\)/],
    ['valor decimal', {}, { tipo: 'aumentar', valor: 250.5 }, /números inteiros/],
    [
      'aumentar sem fichas',
      { stack: 80 },
      { tipo: 'aumentar', valor: 80 },
      /o máximo possível é pagar/,
    ],
    [
      'aumentar sem a ação reaberta',
      { podeAumentar: false },
      { tipo: 'aumentar', valor: 300 },
      /não foi reaberta/,
    ],
    ['all-in sem a ação reaberta', { podeAumentar: false }, { tipo: 'all-in' }, /não foi reaberta/],
    ['agir já estando all-in', { stack: 0 }, { tipo: 'desistir' }, /já está all-in/],
  ])('%s', (_nome, s, acao, esperado) => {
    expect(motivo(situacao(s), acao)).toMatch(esperado);
  });

  it('sem a ação reaberta, all-in ainda vale se for só para pagar', () => {
    expect(efeito(situacao({ podeAumentar: false, stack: 60 }), { tipo: 'all-in' }).tipo).toBe(
      'pagar',
    );
  });
});

describe('conferirSituacao', () => {
  it.each<[Partial<SituacaoDeAposta>, RegExp]>([
    [{ stack: -1 }, /stack = -1/],
    [{ maiorAposta: 10.5 }, /maiorAposta = 10.5/],
    [{ aumentoMinimo: 0 }, /aumentoMinimo precisa ser maior que zero/],
    [{ apostaDoJogador: 200 }, /apostaDoJogador \(200\) maior que maiorAposta \(100\)/],
  ])('rejeita situação impossível %o', (s, esperado) => {
    expect(() => conferirSituacao(situacao(s))).toThrow(esperado);
  });
});
