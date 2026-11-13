export const NAIPES = ['paus', 'ouros', 'copas', 'espadas'] as const;

export type Naipe = (typeof NAIPES)[number];

/**
 * Valores numéricos das cartas: 2 a 10, Valete = 11, Dama = 12, Rei = 13, Ás = 14.
 *
 * O Ás vale 14 (carta mais alta). O caso da sequência A-2-3-4-5, em que o Ás conta
 * como 1, é responsabilidade do avaliador de mãos, não do tipo da carta.
 */
export const VALORES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export type Valor = (typeof VALORES)[number];

export interface Carta {
  readonly valor: Valor;
  readonly naipe: Naipe;
}

export function cartasIguais(a: Carta, b: Carta): boolean {
  return a.valor === b.valor && a.naipe === b.naipe;
}
