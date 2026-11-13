import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NAIPES, VALORES, type Carta } from './carta.js';
import { carta, cartas, formatarCarta, formatarCartas } from './notacao.js';

const qualquerCarta = fc.record({
  valor: fc.constantFrom(...VALORES),
  naipe: fc.constantFrom(...NAIPES),
});

describe('carta', () => {
  it('lê valor e naipe', () => {
    expect(carta('As')).toEqual({ valor: 14, naipe: 'espadas' });
    expect(carta('Td')).toEqual({ valor: 10, naipe: 'ouros' });
    expect(carta('2c')).toEqual({ valor: 2, naipe: 'paus' });
    expect(carta('Kh')).toEqual({ valor: 13, naipe: 'copas' });
  });

  it.each(['', 'A', 'Asd', '1s', '10s', 'as', 'AS', 'Ax', ' As'])('rejeita "%s"', (texto) => {
    expect(() => carta(texto)).toThrow(/Carta inválida/);
  });
});

describe('cartas', () => {
  it('lê uma lista separada por espaços', () => {
    expect(cartas('As Kd')).toEqual<Carta[]>([
      { valor: 14, naipe: 'espadas' },
      { valor: 13, naipe: 'ouros' },
    ]);
  });

  it('aceita espaços extras e lista vazia', () => {
    expect(cartas('  As   Kd ')).toHaveLength(2);
    expect(cartas('')).toEqual([]);
    expect(cartas('   ')).toEqual([]);
  });

  it('rejeita cartas repetidas', () => {
    expect(() => cartas('As Kd As')).toThrow(/Carta repetida: "As"/);
  });
});

describe('formatação', () => {
  it('formata uma lista', () => {
    expect(formatarCartas(cartas('As Td 2c'))).toBe('As Td 2c');
  });

  it('ida e volta: ler o texto formatado devolve a mesma carta', () => {
    fc.assert(
      fc.property(qualquerCarta, (c) => {
        expect(carta(formatarCarta(c))).toEqual(c);
      }),
    );
  });

  it('as 52 cartas têm notações diferentes', () => {
    const todas = VALORES.flatMap((valor) => NAIPES.map((naipe) => ({ valor, naipe })));
    const notacoes = new Set(todas.map(formatarCarta));
    expect(notacoes.size).toBe(52);
  });
});
