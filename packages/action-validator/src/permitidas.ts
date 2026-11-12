import { conferirSituacao, type AcoesPermitidas, type SituacaoDeAposta } from './situacao.js';

/**
 * Calcula as ações permitidas para o jogador da vez (No-Limit Hold'em).
 *
 * Regras aplicadas:
 * - Quem não tem mais fichas (já está all-in) não age.
 * - Passar só vale sem aposta a pagar; pagar só vale com aposta a pagar.
 * - Pagar com menos fichas do que o necessário vira all-in pelo que tem.
 * - Apostar só vale se ninguém apostou na rodada. Mínimo: o big blind (aumentoMinimo).
 * - Aumentar só vale se já existe aposta. Mínimo: maior aposta + último aumento completo.
 * - Em ambos, quem não tem fichas para o mínimo ainda pode ir all-in por menos.
 * - Se a ação não foi reaberta (podeAumentar = falso), não pode aumentar nem ir all-in
 *   por mais que a aposta atual.
 */
export function acoesPermitidas(s: SituacaoDeAposta): AcoesPermitidas {
  conferirSituacao(s);

  if (s.stack === 0) return { desistir: false, passar: false };

  const paraPagar = s.maiorAposta - s.apostaDoJogador;
  const totalPossivel = s.apostaDoJogador + s.stack;
  const ninguemApostou = s.maiorAposta === 0;
  const podeSubir = totalPossivel > s.maiorAposta && (ninguemApostou || s.podeAumentar);

  return {
    desistir: true,
    passar: paraPagar === 0,
    ...(paraPagar > 0 && { pagar: Math.min(paraPagar, s.stack) }),
    ...(podeSubir &&
      ninguemApostou && {
        apostar: { minimo: Math.min(s.aumentoMinimo, totalPossivel), maximo: totalPossivel },
      }),
    ...(podeSubir &&
      !ninguemApostou && {
        aumentar: {
          minimo: Math.min(s.maiorAposta + s.aumentoMinimo, totalPossivel),
          maximo: totalPossivel,
        },
      }),
    ...((podeSubir || totalPossivel <= s.maiorAposta) && { allIn: totalPossivel }),
  };
}
