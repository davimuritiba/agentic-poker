import { acoesPermitidas, validarAcao, type SituacaoDeAposta } from '@poker/action-validator';
import { NAIPES, VALORES, cartas, type Carta } from '@poker/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decidirJogadaDoBot, forcaDaMao } from './bot-simples.js';

const BARALHO: Carta[] = VALORES.flatMap((valor) => NAIPES.map((naipe) => ({ valor, naipe })));

describe('forcaDaMao', () => {
  it('ordena mãos iniciais de forma razoável', () => {
    const f = (texto: string) => forcaDaMao(cartas(texto), []);
    expect(f('As Ah')).toBeGreaterThan(f('Ks Kh'));
    expect(f('Ks Kh')).toBeGreaterThan(f('As Kd'));
    expect(f('As Ks')).toBeGreaterThan(f('As Kd'));
    expect(f('As Kd')).toBeGreaterThan(f('7c 2d'));
  });

  it('depois do flop, mão feita vale mais que nada', () => {
    const mesa = cartas('Kc 7d 2h');
    expect(forcaDaMao(cartas('Kh Kd'), mesa)).toBeGreaterThan(forcaDaMao(cartas('Ah 7c'), mesa));
    expect(forcaDaMao(cartas('Ah 7c'), mesa)).toBeGreaterThan(forcaDaMao(cartas('Qh Jc'), mesa));
  });
});

describe('decidirJogadaDoBot', () => {
  const situacao = fc
    .record({
      stack: fc.integer({ min: 1, max: 2000 }),
      maiorAposta: fc.integer({ min: 0, max: 1000 }),
      fracao: fc.double({ min: 0, max: 1, noNaN: true }),
      podeAumentar: fc.boolean(),
    })
    .map(({ fracao, ...s }): SituacaoDeAposta => ({
      ...s,
      apostaDoJogador: Math.floor(s.maiorAposta * fracao),
      aumentoMinimo: 10,
    }));

  it('sempre escolhe uma jogada legal', () => {
    fc.assert(
      fc.property(
        situacao,
        fc.shuffledSubarray(BARALHO, { minLength: 5, maxLength: 7 }),
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        (s, sorteadas, sorte) => {
          const [a, b, ...mesa] = sorteadas;
          const acao = decidirJogadaDoBot(
            {
              cartas: [a as Carta, b as Carta],
              cartasNaMesa: mesa.length >= 3 ? mesa : [],
              acoes: acoesPermitidas(s),
              pote: s.maiorAposta * 2 + 15,
              bigBlind: 10,
            },
            () => sorte,
          );
          expect(validarAcao(s, acao).valida).toBe(true);
        },
      ),
      { numRuns: 3_000 },
    );
  });
});
