import { NAIPES, VALORES, cartasIguais, formatarCarta, type Carta } from '@poker/shared-types';
import { embaralhar, sortearSeguro, type Sorteador } from './embaralhar.js';

/**
 * Um baralho é uma lista de cartas em que a posição 0 é o topo (a próxima carta a sair).
 *
 * O baralho é imutável: distribuir cartas devolve um baralho novo em vez de alterar o
 * atual. Isso combina com o Game Engine, que calcula cada estado novo a partir do
 * anterior sem modificá-lo.
 */
export type Baralho = readonly Carta[];

/** As 52 cartas em ordem fixa: valores de 2 a Ás, cada um nos quatro naipes. */
export function criarBaralho(): Baralho {
  return VALORES.flatMap((valor) => NAIPES.map((naipe) => ({ valor, naipe })));
}

/** Baralho completo embaralhado com RNG criptográfico. */
export function baralhoEmbaralhado(sortear: Sorteador = sortearSeguro): Baralho {
  return embaralhar(criarBaralho(), sortear);
}

/** Tira `quantidade` cartas do topo. Devolve as cartas tiradas e o baralho que sobrou. */
export function distribuir(
  baralho: Baralho,
  quantidade: number,
): { cartas: Carta[]; restante: Baralho } {
  if (!Number.isInteger(quantidade) || quantidade < 0) {
    throw new Error(`Quantidade inválida para distribuir: ${quantidade}.`);
  }
  if (quantidade > baralho.length) {
    throw new Error(
      `Não há cartas suficientes: pedido de ${quantidade}, restam ${baralho.length}.`,
    );
  }
  return { cartas: baralho.slice(0, quantidade), restante: baralho.slice(quantidade) };
}

/**
 * Monta um baralho completo com as cartas escolhidas no topo, na ordem dada. As demais
 * vêm depois, em ordem fixa.
 *
 * Serve para testes e simulações reproduzíveis: com `cartas('As Kd Qh Jc Ts')` no topo,
 * a mão sempre sai igual. Nunca use em uma mesa real.
 */
export function baralhoComCartasNoTopo(topo: readonly Carta[]): Baralho {
  topo.forEach((c, i) => {
    if (topo.findIndex((outra) => cartasIguais(outra, c)) !== i) {
      throw new Error(`Carta repetida no topo do baralho: "${formatarCarta(c)}".`);
    }
  });
  const resto = criarBaralho().filter((c) => !topo.some((t) => cartasIguais(t, c)));
  return [...topo, ...resto];
}
