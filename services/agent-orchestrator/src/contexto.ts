/**
 * Transforma a VisaoDaMesa do jogador (já filtrada pelo servidor do jogo) no contexto que
 * o coach usa. Não existe outra fonte de dados: o coach não tem como ver cartas ocultas.
 */
import type { AcoesPermitidas, Carta, Fichas, VisaoDaMesa } from '@poker/shared-types';

export interface ContextoDoJogador {
  readonly numeroDaMao: number;
  readonly momento: number;
  readonly fase: string;
  readonly minhasCartas: readonly Carta[];
  readonly cartasNaMesa: readonly Carta[];
  readonly meuStack: Fichas;
  readonly minhaAposta: Fichas;
  /** Pote total, incluindo as apostas da rodada atual. */
  readonly pote: Fichas;
  readonly maiorAposta: Fichas;
  readonly paraPagar: Fichas;
  readonly bigBlind: Fichas;
  /** Adversários ainda na mão (não desistiram). */
  readonly oponentes: readonly {
    readonly nome: string;
    readonly stack: Fichas;
    readonly aposta: Fichas;
    readonly allIn: boolean;
    readonly ehBot: boolean;
  }[];
  readonly posicao: string;
  readonly acoes: AcoesPermitidas;
  /** Histórico público da mão, em texto. */
  readonly historico: readonly string[];
}

/** Monta o contexto, ou explica por que não dá para analisar agora. */
export function montarContexto(
  visao: VisaoDaMesa,
): { ok: true; contexto: ContextoDoJogador } | { ok: false; motivo: string } {
  const euId = visao.voce?.id;
  const eu = visao.jogadores.find((j) => j.id === euId);
  if (!eu || !eu.cartas || eu.cartas.length !== 2) {
    return { ok: false, motivo: 'Você não está participando desta mão.' };
  }
  if (eu.situacao !== 'ativo')
    return { ok: false, motivo: 'Você não tem decisão a tomar nesta mão.' };
  const acoes = visao.voce?.acoes;
  if (!acoes) return { ok: false, motivo: 'O coach analisa a sua jogada quando for a sua vez.' };
  if (![0, 3, 4, 5].includes(visao.cartasNaMesa.length)) {
    return { ok: false, motivo: 'Situação da mesa inválida.' };
  }

  const nome = (id: string) => visao.jogadores.find((j) => j.id === id)?.nome ?? 'Alguém';
  const apostas = visao.jogadores.reduce((soma, j) => soma + j.apostaNaRodada, 0);
  const oponentes = visao.jogadores
    .filter((j) => j.id !== euId && (j.situacao === 'ativo' || j.situacao === 'all-in'))
    .map((j) => ({
      nome: j.nome,
      stack: j.stack,
      aposta: j.apostaNaRodada,
      allIn: j.situacao === 'all-in',
      ehBot: j.ehBot,
    }));
  if (oponentes.length === 0) return { ok: false, motivo: 'Não há adversários na mão.' };

  return {
    ok: true,
    contexto: {
      numeroDaMao: visao.numeroDaMao,
      momento: visao.eventos.length,
      fase: visao.fase,
      minhasCartas: eu.cartas,
      cartasNaMesa: visao.cartasNaMesa,
      meuStack: eu.stack,
      minhaAposta: eu.apostaNaRodada,
      pote: visao.pote + apostas,
      maiorAposta: visao.maiorAposta,
      paraPagar: acoes.pagar ?? 0,
      bigBlind: visao.bigBlind,
      oponentes,
      posicao: posicaoDe(visao, eu.id),
      acoes,
      historico: visao.eventos.flatMap((ev): string[] => {
        switch (ev.tipo) {
          case 'blind':
            return [`${nome(ev.jogadorId)} posta ${ev.qual} blind de ${ev.valor}`];
          case 'acao':
            return [
              `${nome(ev.jogadorId)}: ${ev.acao}${ev.acao === 'desistir' || ev.acao === 'passar' ? '' : ` (total ${ev.apostaTotal})`}${ev.allIn ? ' all-in' : ''}`,
            ];
          case 'cartas':
            return [`${ev.fase}: ${ev.cartas.length} carta(s) abertas`];
          default:
            return [];
        }
      }),
    },
  };
}

/** Posição do jogador em relação ao botão: quem age por último depois do flop tem vantagem. */
function posicaoDe(visao: VisaoDaMesa, euId: string): string {
  const blind = visao.eventos.find((e) => e.tipo === 'blind' && e.jogadorId === euId);
  if (blind && blind.tipo === 'blind') return blind.qual === 'small' ? 'small blind' : 'big blind';
  const eu = visao.jogadores.find((j) => j.id === euId);
  if (eu?.ehBotao) return 'botão (age por último depois do flop)';

  const naMao = visao.jogadores.filter((j) => j.situacao !== 'aguardando');
  const iBotao = naMao.findIndex((j) => j.ehBotao);
  const iEu = naMao.findIndex((j) => j.id === euId);
  if (iBotao < 0 || iEu < 0) return 'desconhecida';
  // Distância até o botão: quanto menor, mais tarde o jogador age.
  const distancia = (iBotao - iEu + naMao.length) % naMao.length;
  if (distancia <= 1) return 'final (age perto do último)';
  return distancia >= naMao.length - 3 ? 'início (age cedo)' : 'meio';
}
