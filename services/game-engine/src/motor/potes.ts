import type { Fichas } from '@poker/shared-types';
import type { JogadorNaMao } from './tipos.js';

export interface Pote {
  readonly valor: Fichas;
  /** Ids de quem pode ganhar este pote, na ordem de `jogadores`. */
  readonly elegiveis: readonly string[];
}

/**
 * Divide as fichas apostadas em pote principal e side pots.
 *
 * Quando alguém vai all-in com menos fichas que os outros, só pode ganhar de cada
 * adversário o mesmo tanto que apostou. Para isso, os potes são cortados nos níveis de
 * aposta de quem continua na mão:
 *
 *   A all-in com 100, B all-in com 300, C apostou 300:
 *   - pote principal: 100 de cada = 300, disputado por A, B e C;
 *   - side pot: mais 200 de B e C = 400, disputado só por B e C.
 *
 * Fichas de quem desistiu entram nos potes, mas essa pessoa não é elegível.
 * Um pote com um elegível só é o excedente de uma aposta que ninguém pagou: volta para ele.
 */
export function calcularPotes(jogadores: readonly JogadorNaMao[]): Pote[] {
  const naMao = jogadores.filter((j) => j.situacao !== 'desistiu');
  const niveis = [...new Set(naMao.map((j) => j.totalApostado))]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const potes: { valor: Fichas; elegiveis: string[] }[] = [];
  let anterior = 0;
  for (const nivel of niveis) {
    const valor = jogadores.reduce(
      (soma, j) => soma + Math.min(j.totalApostado, nivel) - Math.min(j.totalApostado, anterior),
      0,
    );
    const elegiveis = naMao.filter((j) => j.totalApostado >= nivel).map((j) => j.id);
    if (valor > 0) potes.push({ valor, elegiveis });
    anterior = nivel;
  }

  // Segurança: fichas acima do maior nível (não deveria acontecer) vão para o último pote.
  const total = jogadores.reduce((soma, j) => soma + j.totalApostado, 0);
  const distribuido = potes.reduce((soma, p) => soma + p.valor, 0);
  const ultimo = potes.at(-1);
  if (ultimo && total > distribuido) ultimo.valor += total - distribuido;

  return potes;
}
