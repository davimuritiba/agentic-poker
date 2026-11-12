/**
 * Monta o que UM jogador pode ver da mesa. É aqui que o servidor autoritativo protege a
 * informação secreta: cartas dos adversários só aparecem quando reveladas no showdown, e
 * o baralho nunca sai do servidor.
 */
import type { Fichas, JogadorVisivel, VisaoDaMesa } from '@poker/shared-types';
import { acoesDaVez, type EstadoDaMao } from '../motor/index.js';

export interface Assento {
  readonly id: string;
  readonly nome: string;
  stack: Fichas;
  readonly ehBot: boolean;
  conectado: boolean;
  /** Pediu para sair: deixa o assento ao fim da mão. */
  saindo: boolean;
}

export interface InstantaneoDaMesa {
  readonly id: string;
  readonly nome: string;
  readonly smallBlind: Fichas;
  readonly bigBlind: Fichas;
  readonly assentos: readonly (Assento | null)[];
  readonly mao: EstadoDaMao | null;
  readonly numeroDaMao: number;
  readonly assentoDoBotao: number | null;
  readonly prazoDaVez: number | null;
}

export function montarVisao(m: InstantaneoDaMesa, quemVe: string | null): VisaoDaMesa {
  const { mao } = m;
  const emAndamento = mao !== null && mao.fase !== 'encerrada';
  const reveladas = mao?.resultado?.maosReveladas ?? {};

  const jogadores: JogadorVisivel[] = m.assentos.flatMap((a, assento) => {
    if (!a) return [];
    const naMao = mao?.jogadores.find((j) => j.id === a.id);
    const podeVerCartas = naMao !== undefined && (a.id === quemVe || a.id in reveladas);
    return [
      {
        id: a.id,
        nome: a.nome,
        assento,
        stack: naMao ? naMao.stack : a.stack,
        apostaNaRodada: naMao && emAndamento ? naMao.apostaNaRodada : 0,
        situacao: naMao ? naMao.situacao : 'aguardando',
        ehBot: a.ehBot,
        conectado: a.conectado,
        cartas: podeVerCartas ? naMao.cartas : null,
        quantidadeDeCartas: naMao && naMao.situacao !== 'desistiu' ? naMao.cartas.length : 0,
        ehBotao: assento === m.assentoDoBotao,
      },
    ];
  });

  const vezDe = mao && mao.vez !== null ? (mao.jogadores[mao.vez]?.id ?? null) : null;
  const sentado = m.assentos.some((a) => a?.id === quemVe);
  // Pote = fichas já recolhidas. Depois do fim da mão, já foram para os vencedores.
  const pote = emAndamento
    ? mao.jogadores.reduce((soma, j) => soma + j.totalApostado - j.apostaNaRodada, 0)
    : 0;

  return {
    id: m.id,
    nome: m.nome,
    smallBlind: m.smallBlind,
    bigBlind: m.bigBlind,
    maxJogadores: m.assentos.length,
    numeroDaMao: m.numeroDaMao,
    fase: mao ? mao.fase : 'aguardando',
    jogadores,
    cartasNaMesa: mao?.cartasNaMesa ?? [],
    pote,
    maiorAposta: emAndamento ? mao.maiorAposta : 0,
    vezDe,
    prazoDaVez: vezDe ? m.prazoDaVez : null,
    voce: quemVe
      ? {
          id: quemVe,
          sentado,
          acoes: mao && vezDe === quemVe ? acoesDaVez(mao) : null,
        }
      : null,
    eventos: mao?.eventos ?? [],
    resultado: mao?.resultado ?? null,
  };
}
