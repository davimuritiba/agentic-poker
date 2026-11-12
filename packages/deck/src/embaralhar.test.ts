import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { embaralhar, sortearSeguro, type Sorteador } from './embaralhar.js';

/** Sorteador previsível, alimentado por números em [0, 1) gerados pelo fast-check. */
function sorteadorDe(fracoes: readonly number[]): Sorteador {
  let k = 0;
  return (limite) => Math.floor((fracoes[k++ % fracoes.length] ?? 0) * limite);
}

const fracoes = fc.array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), {
  minLength: 1,
});

describe('embaralhar', () => {
  it('sorteia entre 0 e i em cada posição, de trás para frente (Fisher-Yates)', () => {
    const limites: number[] = [];
    embaralhar([1, 2, 3, 4, 5], (limite) => {
      limites.push(limite);
      return 0;
    });
    expect(limites).toEqual([5, 4, 3, 2]);
  });

  it('devolve sempre os mesmos itens, só em outra ordem', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fracoes, (itens, f) => {
        const resultado = embaralhar(itens, sorteadorDe(f));
        expect([...resultado].sort((a, b) => a - b)).toEqual([...itens].sort((a, b) => a - b));
      }),
    );
  });

  it('não altera a lista recebida', () => {
    const original = [1, 2, 3, 4, 5];
    embaralhar(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it('aceita listas vazias e de um item', () => {
    expect(embaralhar([])).toEqual([]);
    expect(embaralhar(['x'])).toEqual(['x']);
  });

  it.each([-1, 5, 0.5, NaN])('rejeita sorteador que devolve %s', (valor) => {
    expect(() => embaralhar([1, 2, 3, 4, 5], () => valor)).toThrow(/fora do intervalo/);
  });

  it('com o RNG seguro, as 6 ordens de 3 itens saem com a mesma frequência', () => {
    const rodadas = 60_000;
    const contagem = new Map<string, number>();
    for (let n = 0; n < rodadas; n++) {
      const ordem = embaralhar(['a', 'b', 'c'], sortearSeguro).join('');
      contagem.set(ordem, (contagem.get(ordem) ?? 0) + 1);
    }

    // Esperado: 10.000 por ordem. A margem de 5% fica a mais de 5 desvios-padrão,
    // então o teste praticamente nunca falha por acaso, mas pega qualquer viés real.
    expect(contagem.size).toBe(6);
    for (const vezes of contagem.values()) {
      expect(vezes).toBeGreaterThan(9_500);
      expect(vezes).toBeLessThan(10_500);
    }
  });
});
