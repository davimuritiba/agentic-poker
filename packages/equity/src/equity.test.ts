import { cartas } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { calcularEquity, equityNecessaria } from './equity.js';

/** Gerador previsível (mulberry32), para os testes não dependerem da sorte. */
function semente(n: number): () => number {
  let a = n;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const equity = (mao: string, mesa: string, oponentes = 1, simulacoes = 20_000) =>
  calcularEquity({
    minhasCartas: cartas(mao),
    cartasNaMesa: cartas(mesa),
    oponentes,
    simulacoes,
    aleatorio: semente(42),
  });

describe('calcularEquity', () => {
  // Valores de referência conhecidos (contra 1 mão aleatória).
  it.each([
    ['As Ah', 0.852],
    ['Ks Kh', 0.824],
    ['As Ks', 0.67],
    ['7c 2d', 0.346],
  ])('%s antes do flop ≈ %s', (mao, esperado) => {
    expect(equity(mao, '').equity).toBeCloseTo(esperado, 1);
    expect(Math.abs(equity(mao, '').equity - esperado)).toBeLessThan(0.015);
  });

  it('mais adversários diminuem a equity', () => {
    const contraUm = equity('As Ah', '', 1).equity;
    const contraCinco = equity('As Ah', '', 5).equity;
    expect(contraCinco).toBeLessThan(contraUm - 0.3);
  });

  it('projeto de flush no flop vira flush cerca de 35% das vezes até o river', () => {
    // 9 cartas de copas restantes: 1 - (38/47 × 37/46) ≈ 35%.
    const r = equity('Ah 7h', 'Kh 2h 9c');
    const flushOuMelhor = r.categoriasFinais.flush + r.categoriasFinais['straight-flush'];
    expect(Math.abs(flushOuMelhor - 0.35)).toBeLessThan(0.015);
  });

  it('mesa completa com royal flush: todos empatam e dividem o pote', () => {
    const r = equity('2c 3d', 'As Ks Qs Js Ts', 2, 2_000);
    expect(r.empate).toBe(1);
    expect(r.equity).toBeCloseTo(1 / 3, 5);
  });

  it('a nut no river ganha sempre', () => {
    const r = equity('As Ks', 'Qs Js Ts 2c 3d', 3, 2_000);
    expect(r.vitoria).toBe(1);
  });

  it('as categorias finais somam 100%', () => {
    const r = equity('9c 8c', 'Tc 7d 2h');
    const soma = Object.values(r.categoriasFinais).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(1, 10);
  });

  it.each<[string, () => unknown, RegExp]>([
    ['uma carta só', () => equity('As', ''), /exatamente 2 cartas/],
    ['mesa com 2 cartas', () => equity('As Ks', 'Qs Js'), /0, 3, 4 ou 5/],
    ['zero oponentes', () => equity('As Ks', '', 0), /oponentes inválido/],
    ['carta repetida', () => equity('As Ks', 'As Qd 2c'), /repetidas/],
  ])('rejeita %s', (_nome, chamar, erro) => {
    expect(chamar).toThrow(erro);
  });
});

describe('equityNecessaria', () => {
  it('pagar 50 num pote de 100 exige 33%', () => {
    expect(equityNecessaria(50, 100)).toBeCloseTo(1 / 3, 10);
  });

  it('nada a pagar exige 0%', () => {
    expect(equityNecessaria(0, 100)).toBe(0);
  });
});
