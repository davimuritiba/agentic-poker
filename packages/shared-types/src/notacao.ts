/**
 * Notação curta das cartas, a mesma usada em softwares e bibliotecas de poker:
 * valor (2-9, T, J, Q, K, A) seguido do naipe (c = paus, d = ouros, h = copas,
 * s = espadas). Exemplos: "As" = Ás de espadas, "Td" = 10 de ouros.
 *
 * Serve para deixar testes e logs legíveis: `cartas('As Ks Qs Js Ts')`
 * em vez de cinco objetos.
 */

import type { Carta, Naipe, Valor } from './carta.js';

const LETRA_DO_VALOR: Record<Valor, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: 'T',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

const LETRA_DO_NAIPE: Record<Naipe, string> = {
  paus: 'c',
  ouros: 'd',
  copas: 'h',
  espadas: 's',
};

const VALOR_DA_LETRA = new Map(
  Object.entries(LETRA_DO_VALOR).map(([valor, letra]) => [letra, Number(valor) as Valor]),
);

const NAIPE_DA_LETRA = new Map(
  Object.entries(LETRA_DO_NAIPE).map(([naipe, letra]) => [letra, naipe as Naipe]),
);

/** Converte uma carta na notação curta, por exemplo "As", para o objeto `Carta`. */
export function carta(texto: string): Carta {
  const valor = VALOR_DA_LETRA.get(texto.charAt(0));
  const naipe = NAIPE_DA_LETRA.get(texto.charAt(1));

  if (texto.length !== 2 || valor === undefined || naipe === undefined) {
    throw new Error(
      `Carta inválida: "${texto}". Use o valor (2-9, T, J, Q, K, A) seguido do naipe ` +
        `(c, d, h, s), como "As" ou "Td".`,
    );
  }

  return { valor, naipe };
}

/**
 * Converte uma lista de cartas separadas por espaço, por exemplo "As Ks Qs".
 * Rejeita cartas repetidas, que não podem existir num baralho só.
 */
export function cartas(texto: string): Carta[] {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  const vistas = new Set<string>();

  return partes.map((parte) => {
    const resultado = carta(parte);
    if (vistas.has(parte)) {
      throw new Error(`Carta repetida: "${parte}" aparece mais de uma vez em "${texto}".`);
    }
    vistas.add(parte);
    return resultado;
  });
}

/** Converte um objeto `Carta` para a notação curta, por exemplo "As". */
export function formatarCarta(c: Carta): string {
  return LETRA_DO_VALOR[c.valor] + LETRA_DO_NAIPE[c.naipe];
}

/** Converte uma lista de cartas para a notação curta separada por espaço. */
export function formatarCartas(lista: readonly Carta[]): string {
  return lista.map(formatarCarta).join(' ');
}
