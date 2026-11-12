/**
 * Testes de referência: em vez de casos escritos à mão, comparam o avaliador com
 * resultados conhecidos (todas as mãos de 5 cartas) e com outra biblioteca (pokersolver).
 */
import { NAIPES, VALORES, carta, formatarCarta, type Carta } from '@poker/shared-types';
import fc from 'fast-check';
import pokersolver from 'pokersolver';
import { describe, expect, it } from 'vitest';
import { CATEGORIAS, avaliarMao, compararMaos, type CategoriaDeMao } from './avaliador.js';

const BARALHO: Carta[] = VALORES.flatMap((valor) => NAIPES.map((naipe) => ({ valor, naipe })));
const NOTACOES = BARALHO.map(formatarCarta);

describe('todas as 2.598.960 mãos de 5 cartas', () => {
  // Frequências conhecidas da combinatória do poker.
  const esperado: Record<CategoriaDeMao, { maos: number; distintas: number }> = {
    'straight-flush': { maos: 40, distintas: 10 },
    quadra: { maos: 624, distintas: 156 },
    'full-house': { maos: 3_744, distintas: 156 },
    flush: { maos: 5_108, distintas: 1_277 },
    sequencia: { maos: 10_200, distintas: 10 },
    trinca: { maos: 54_912, distintas: 858 },
    'dois-pares': { maos: 123_552, distintas: 858 },
    par: { maos: 1_098_240, distintas: 2_860 },
    'carta-alta': { maos: 1_302_540, distintas: 1_277 },
  };

  it('cada categoria aparece o número exato de vezes, com o número exato de forças distintas', () => {
    const contagem = new Map<CategoriaDeMao, number>();
    const forcas = new Map<CategoriaDeMao, Set<number>>(CATEGORIAS.map((c) => [c, new Set()]));
    const mao: Carta[] = [];

    const n = BARALHO.length;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              mao[0] = BARALHO[a]!;
              mao[1] = BARALHO[b]!;
              mao[2] = BARALHO[c]!;
              mao[3] = BARALHO[d]!;
              mao[4] = BARALHO[e]!;
              const { categoria, forca } = avaliarMao(mao);
              contagem.set(categoria, (contagem.get(categoria) ?? 0) + 1);
              forcas.get(categoria)!.add(forca);
            }

    for (const categoria of CATEGORIAS) {
      expect({
        categoria,
        maos: contagem.get(categoria),
        distintas: forcas.get(categoria)!.size,
      }).toEqual({
        categoria,
        ...esperado[categoria],
      });
    }
    // 7.462 é o número clássico de mãos de 5 cartas realmente diferentes em força.
    const total = [...forcas.values()].reduce((soma, s) => soma + s.size, 0);
    expect(total).toBe(7_462);
  }, 60_000);
});

describe('comparação com o pokersolver', () => {
  /** Mesa de 5 cartas e duas mãos de 2 cartas, todas diferentes, como num showdown real. */
  const showdown = fc
    .shuffledSubarray(NOTACOES, { minLength: 9, maxLength: 9 })
    .map((c) => ({ mesa: c.slice(0, 5), maoA: c.slice(5, 7), maoB: c.slice(7, 9) }));

  it('mesma categoria e mesmo vencedor em 5.000 showdowns aleatórios', () => {
    fc.assert(
      fc.property(showdown, ({ mesa, maoA, maoB }) => {
        const textoA = [...mesa, ...maoA];
        const textoB = [...mesa, ...maoB];

        const nossaA = avaliarMao(textoA.map(carta));
        const nossaB = avaliarMao(textoB.map(carta));
        const refA = pokersolver.Hand.solve(textoA);
        const refB = pokersolver.Hand.solve(textoB);

        expect(CATEGORIAS.indexOf(nossaA.categoria) + 1).toBe(refA.rank);
        expect(CATEGORIAS.indexOf(nossaB.categoria) + 1).toBe(refB.rank);

        const ganhadores = pokersolver.Hand.winners([refA, refB]);
        const resultadoRef = ganhadores.length === 2 ? 0 : ganhadores[0] === refA ? 1 : -1;
        expect(Math.sign(compararMaos(nossaA, nossaB))).toBe(resultadoRef);
      }),
      { numRuns: 5_000 },
    );
  });

  it('mesma categoria para mãos de 5, 6 e 7 cartas', () => {
    const mao = fc
      .integer({ min: 5, max: 7 })
      .chain((tamanho) =>
        fc.shuffledSubarray(NOTACOES, { minLength: tamanho, maxLength: tamanho }),
      );
    fc.assert(
      fc.property(mao, (texto) => {
        const nossa = avaliarMao(texto.map(carta));
        expect(CATEGORIAS.indexOf(nossa.categoria) + 1).toBe(pokersolver.Hand.solve(texto).rank);
      }),
      { numRuns: 5_000 },
    );
  });
});

describe('propriedades', () => {
  const setecartas = fc.shuffledSubarray(BARALHO, { minLength: 7, maxLength: 7 });

  it('a ordem das cartas de entrada não muda o resultado', () => {
    fc.assert(
      fc.property(setecartas, fc.nat(), (mao, deslocamento) => {
        const k = deslocamento % mao.length;
        const girada = [...mao.slice(k), ...mao.slice(0, k)].reverse();
        expect(avaliarMao(girada).forca).toBe(avaliarMao(mao).forca);
      }),
    );
  });

  it('as 5 cartas escolhidas, avaliadas sozinhas, têm a mesma força da mão inteira', () => {
    fc.assert(
      fc.property(setecartas, (mao) => {
        const avaliacao = avaliarMao(mao);
        expect(avaliacao.cartas).toHaveLength(5);
        expect(avaliarMao(avaliacao.cartas).forca).toBe(avaliacao.forca);
      }),
    );
  });
});
