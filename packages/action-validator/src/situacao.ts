import { ehQuantidadeDeFichasValida, type Fichas } from '@poker/shared-types';

// Os tipos das ações permitidas ficam em shared-types, porque o cliente web também os usa.
export type { AcoesPermitidas, Intervalo } from '@poker/shared-types';

/**
 * O que o validador precisa saber sobre o jogador da vez e a rodada de apostas atual
 * (pré-flop, flop, turn ou river). Quem monta esta situação é o Game Engine.
 *
 * Todos os valores são em fichas e se referem só à rodada atual.
 */
export interface SituacaoDeAposta {
  /** Fichas que o jogador ainda tem fora da mesa. */
  readonly stack: Fichas;
  /** Fichas que o jogador já colocou nesta rodada (inclui blinds no pré-flop). */
  readonly apostaDoJogador: Fichas;
  /** Maior aposta total feita por alguém nesta rodada. Zero se ninguém apostou. */
  readonly maiorAposta: Fichas;
  /**
   * Tamanho mínimo de um aumento: o último aumento completo da rodada ou, se ainda não
   * houve aposta, o big blind. Também é a aposta mínima.
   */
  readonly aumentoMinimo: Fichas;
  /**
   * Falso quando a ação não foi reaberta para este jogador. Acontece quando ele já agiu
   * e, depois disso, só houve um all-in menor que um aumento completo: aí ele pode
   * pagar ou desistir, mas não aumentar. Quem calcula isso é o Game Engine.
   */
  readonly podeAumentar: boolean;
}

/** Lança erro se a situação for impossível: isso é bug de quem a montou, não jogada ilegal. */
export function conferirSituacao(s: SituacaoDeAposta): void {
  for (const campo of ['stack', 'apostaDoJogador', 'maiorAposta', 'aumentoMinimo'] as const) {
    if (!ehQuantidadeDeFichasValida(s[campo])) {
      throw new Error(`Situação inválida: ${campo} = ${s[campo]} não é uma quantidade de fichas.`);
    }
  }
  if (s.aumentoMinimo === 0) {
    throw new Error('Situação inválida: aumentoMinimo precisa ser maior que zero.');
  }
  if (s.apostaDoJogador > s.maiorAposta) {
    throw new Error(
      `Situação inválida: apostaDoJogador (${s.apostaDoJogador}) maior que maiorAposta (${s.maiorAposta}).`,
    );
  }
}
