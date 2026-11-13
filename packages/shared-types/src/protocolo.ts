/**
 * Mensagens trocadas entre o cliente web e o servidor da mesa (via WebSocket).
 *
 * Tudo aqui é o que o JOGADOR pode ver. O servidor é autoritativo: as cartas dos
 * adversários só aparecem em `cartas` quando são reveladas no showdown, e o baralho
 * nunca sai do servidor.
 */
import type { Acao } from './acao.js';
import type { Carta } from './carta.js';
import type { AnaliseDoCoach, RecomendacaoDoCoach } from './coach.js';
import type { Fichas } from './fichas.js';

/** Intervalo de valores totais permitidos para `apostar` ou `aumentar`. */
export interface Intervalo {
  readonly minimo: Fichas;
  readonly maximo: Fichas;
}

/**
 * Tudo que o jogador da vez pode fazer. Serve para a interface mostrar só os botões
 * válidos e para os bots escolherem uma jogada legal.
 */
export interface AcoesPermitidas {
  readonly desistir: boolean;
  readonly passar: boolean;
  /** Fichas que `pagar` coloca na mesa. Ausente se não há aposta a pagar. */
  readonly pagar?: Fichas;
  readonly apostar?: Intervalo;
  readonly aumentar?: Intervalo;
  /** Aposta total do jogador depois de um all-in. Ausente se o all-in não é permitido. */
  readonly allIn?: Fichas;
}

export type FaseDaMao = 'pre-flop' | 'flop' | 'turn' | 'river' | 'encerrada';

/** Fatos públicos de uma mão, em ordem. Alimentam o histórico na tela (e, no futuro, o narrador). */
export type EventoDaMao =
  | { readonly tipo: 'inicio'; readonly botao: string }
  | {
      readonly tipo: 'blind';
      readonly jogadorId: string;
      readonly qual: 'small' | 'big';
      readonly valor: Fichas;
    }
  | {
      readonly tipo: 'acao';
      readonly jogadorId: string;
      readonly acao: 'desistir' | 'passar' | 'pagar' | 'apostar' | 'aumentar';
      /** Total apostado pelo jogador na rodada depois da ação. */
      readonly apostaTotal: Fichas;
      readonly allIn: boolean;
    }
  | {
      readonly tipo: 'cartas';
      readonly fase: 'flop' | 'turn' | 'river';
      readonly cartas: readonly Carta[];
    }
  | {
      readonly tipo: 'showdown';
      readonly jogadorId: string;
      readonly cartas: readonly Carta[];
      readonly descricao: string;
    }
  | {
      readonly tipo: 'pote';
      readonly valor: Fichas;
      readonly vencedores: readonly string[];
      /** Mão vencedora, ou null quando o pote foi ganho sem disputa. */
      readonly descricao: string | null;
    };

export interface PoteResolvido {
  readonly valor: Fichas;
  readonly elegiveis: readonly string[];
  readonly vencedores: readonly string[];
  readonly descricao: string | null;
}

export interface MaoRevelada {
  readonly cartas: readonly Carta[];
  readonly melhores: readonly Carta[];
  readonly descricao: string;
}

export interface ResultadoDaMao {
  readonly potes: readonly PoteResolvido[];
  /** Fichas que cada jogador recebeu dos potes. */
  readonly ganhos: Readonly<Record<string, Fichas>>;
  /** Mãos mostradas no showdown. Vazio quando todos desistiram menos um. */
  readonly maosReveladas: Readonly<Record<string, MaoRevelada>>;
}

/** `aguardando` = sentado, mas fora da mão atual (entrou no meio dela). */
export type SituacaoNaMesa = 'ativo' | 'desistiu' | 'all-in' | 'aguardando';

export interface JogadorVisivel {
  readonly id: string;
  readonly nome: string;
  readonly assento: number;
  readonly stack: Fichas;
  readonly apostaNaRodada: Fichas;
  readonly situacao: SituacaoNaMesa;
  /** Bots são sempre identificados como bots. */
  readonly ehBot: boolean;
  readonly conectado: boolean;
  /** Cartas do jogador, só quando quem vê pode vê-las. Null = viradas para baixo. */
  readonly cartas: readonly Carta[] | null;
  readonly quantidadeDeCartas: number;
  readonly ehBotao: boolean;
}

export interface VisaoDaMesa {
  readonly id: string;
  readonly nome: string;
  readonly smallBlind: Fichas;
  readonly bigBlind: Fichas;
  readonly maxJogadores: number;
  readonly numeroDaMao: number;
  readonly fase: FaseDaMao | 'aguardando';
  readonly jogadores: readonly JogadorVisivel[];
  readonly cartasNaMesa: readonly Carta[];
  /** Fichas já recolhidas ao pote (sem as apostas da rodada atual). */
  readonly pote: Fichas;
  readonly maiorAposta: Fichas;
  readonly vezDe: string | null;
  /** Momento (ms desde 1970) em que acaba o tempo do jogador da vez. */
  readonly prazoDaVez: number | null;
  readonly voce: {
    readonly id: string;
    readonly sentado: boolean;
    /** Preenchido só quando é a vez de quem está vendo. */
    readonly acoes: AcoesPermitidas | null;
  } | null;
  readonly eventos: readonly EventoDaMao[];
  readonly resultado: ResultadoDaMao | null;
}

export interface ResumoDaMesa {
  readonly id: string;
  readonly nome: string;
  readonly smallBlind: Fichas;
  readonly bigBlind: Fichas;
  readonly jogadores: number;
  readonly bots: number;
  readonly maxJogadores: number;
}

export type Resposta = { readonly ok: true } | { readonly ok: false; readonly motivo: string };

/** Quem está conectado: vem da sessão (cookie emitido pelo serviço auth), nunca do cliente. */
export interface Identificacao {
  readonly jogadorId: string;
  readonly nome: string;
}

export interface EventosDoServidor {
  'lobby:mesas': (mesas: ResumoDaMesa[]) => void;
  'mesa:estado': (visao: VisaoDaMesa | null) => void;
  /** Números do coach: chegam rápido, sem IA. */
  'coach:analise': (analise: AnaliseDoCoach) => void;
  /** Recomendação do agente: chega depois (a IA leva alguns segundos). */
  'coach:recomendacao': (recomendacao: RecomendacaoDoCoach) => void;
}

export interface EventosDoCliente {
  'mesa:entrar': (dados: { mesaId: string }, responder: (r: Resposta) => void) => void;
  'mesa:sair': (responder: (r: Resposta) => void) => void;
  'mesa:adicionar-bot': (responder: (r: Resposta) => void) => void;
  'mesa:acao': (acao: Acao, responder: (r: Resposta) => void) => void;
  /** Pede ao Coach IA uma análise da situação atual do jogador. */
  'coach:pedir': (responder: (r: Resposta) => void) => void;
}
