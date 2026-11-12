/**
 * Mensagens do Coach IA. O coach analisa SÓ o que o jogador pode ver (a mesma
 * VisaoDaMesa que a interface recebe) e devolve números e recomendações.
 */
import type { Fichas } from './fichas.js';

export type AcaoSugerida = 'desistir' | 'passar' | 'pagar' | 'apostar' | 'aumentar' | 'all-in';

export type Avaliacao = 'boa' | 'neutra' | 'ruim';

/** Uma das possibilidades de jogada, avaliada pelos números. */
export interface PossibilidadeDeJogada {
  readonly acao: AcaoSugerida;
  /** Total apostado na rodada (apostar/aumentar/all-in). */
  readonly valor: Fichas | null;
  readonly avaliacao: Avaliacao;
  readonly motivo: string;
}

/** Análise numérica imediata, calculada sem IA. */
export interface AnaliseDoCoach {
  readonly numeroDaMao: number;
  /** Quantidade de eventos da mão no momento da análise: identifica a decisão. */
  readonly momento: number;
  readonly fase: string;
  /** Ex.: "Par de Reis" (depois do flop) ou "A-K do mesmo naipe" (antes). */
  readonly maoAtual: string;
  readonly oponentes: number;
  readonly vitoria: number;
  readonly empate: number;
  readonly equity: number;
  readonly simulacoes: number;
  /** Chance de terminar com cada tipo de mão, só as mais relevantes, em ordem. */
  readonly chancesFinais: readonly { readonly mao: string; readonly chance: number }[];
  readonly pote: Fichas;
  readonly paraPagar: Fichas;
  /** Equity mínima para pagar valer a pena (pot odds), ou null se não há o que pagar. */
  readonly equityNecessaria: number | null;
  readonly posicao: string;
  readonly possibilidades: readonly PossibilidadeDeJogada[];
}

export interface RecomendacaoDoCoach {
  readonly numeroDaMao: number;
  readonly momento: number;
  /** `ia` = gerada pelo agente (Claude); `regras` = coach determinístico (sem IA). */
  readonly fonte: 'ia' | 'regras';
  readonly acao: AcaoSugerida;
  readonly valor: Fichas | null;
  readonly confianca: 'baixa' | 'media' | 'alta';
  readonly resumo: string;
  readonly explicacao: string;
  readonly alternativas: readonly {
    readonly acao: AcaoSugerida;
    readonly valor: Fichas | null;
    readonly quando: string;
  }[];
  /** Conceito de poker ensinado nesta jogada. */
  readonly conceito: string;
  /** Ferramentas que o agente decidiu usar (transparência). */
  readonly ferramentasUsadas: readonly string[];
  /** Por que a IA não foi usada, quando `fonte` é `regras`. */
  readonly aviso: string | null;
}
