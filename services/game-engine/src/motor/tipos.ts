import type { Baralho } from '@poker/deck';
import type { Carta, EventoDaMao, FaseDaMao, Fichas, ResultadoDaMao } from '@poker/shared-types';

export interface ConfigDaMao {
  readonly smallBlind: Fichas;
  readonly bigBlind: Fichas;
}

export type SituacaoDoJogador = 'ativo' | 'desistiu' | 'all-in';

export interface JogadorNaMao {
  readonly id: string;
  readonly assento: number;
  /** Fichas que o jogador ainda tem fora da mesa. */
  readonly stack: Fichas;
  /** Fichas apostadas na rodada atual (zera a cada rodada). */
  readonly apostaNaRodada: Fichas;
  /** Fichas apostadas na mão inteira. É o que define os side pots. */
  readonly totalApostado: Fichas;
  readonly cartas: readonly Carta[];
  readonly situacao: SituacaoDoJogador;
  /** Já agiu desde o último aumento completo (ou desde o início da rodada). */
  readonly jaAgiu: boolean;
  /** Maior aposta da rodada logo depois da última ação deste jogador. */
  readonly apostaQuandoAgiu: Fichas;
}

/**
 * Estado completo de uma mão. Contém informação secreta (cartas de todos e o baralho):
 * nunca vai inteiro para o cliente. O que cada jogador vê é montado em `mesa/visao.ts`.
 */
export interface EstadoDaMao {
  readonly config: ConfigDaMao;
  readonly fase: FaseDaMao;
  /** Em ordem de assento. */
  readonly jogadores: readonly JogadorNaMao[];
  /** Índice (em `jogadores`) de quem está no botão (dealer). */
  readonly botao: number;
  readonly cartasNaMesa: readonly Carta[];
  readonly baralho: Baralho;
  readonly maiorAposta: Fichas;
  readonly aumentoMinimo: Fichas;
  /** Índice de quem deve agir agora, ou null se ninguém (mão encerrada). */
  readonly vez: number | null;
  readonly eventos: readonly EventoDaMao[];
  readonly resultado: ResultadoDaMao | null;
}

export interface ParametrosDaMao {
  readonly config: ConfigDaMao;
  /** Jogadores com fichas (stack > 0), em qualquer ordem. */
  readonly jogadores: readonly {
    readonly id: string;
    readonly assento: number;
    readonly stack: Fichas;
  }[];
  readonly assentoDoBotao: number;
  /** Para testes: baralho com ordem definida. Padrão: embaralhado com RNG criptográfico. */
  readonly baralho?: Baralho;
}

export type ResultadoDaJogada =
  | { readonly ok: true; readonly estado: EstadoDaMao }
  | { readonly ok: false; readonly motivo: string };
