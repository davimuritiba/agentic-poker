/**
 * Mensagens do Coach IA. O coach analisa SÓ o que o jogador pode ver (a mesma
 * VisaoDaMesa que a interface recebe) e devolve números e recomendações.
 */
import type { Fichas } from './fichas.js';

export type AcaoSugerida = 'desistir' | 'passar' | 'pagar' | 'apostar' | 'aumentar' | 'all-in';

export type Avaliacao = 'boa' | 'neutra' | 'ruim';

/** Estilo de jogo que o coach recomenda. O jogador escolhe. */
export const PERFIS_DO_COACH = ['agressivo', 'equilibrado', 'seguro'] as const;

export type PerfilDoCoach = (typeof PERFIS_DO_COACH)[number];

export const PERFIL_RECOMENDADO: PerfilDoCoach = 'equilibrado';

export const NOMES_DOS_PERFIS: Record<PerfilDoCoach, string> = {
  agressivo: 'Agressivo',
  equilibrado: 'Equilibrado (recomendado)',
  seguro: 'Seguro',
};

export const DESCRICOES_DOS_PERFIS: Record<PerfilDoCoach, string> = {
  agressivo: 'Toma a iniciativa: aposta e aumenta mais, aceita mais risco e blefa às vezes.',
  equilibrado: 'Segue os números: paga quando compensa, aposta por valor e blefa pouco.',
  seguro: 'Protege as fichas: só arrisca com margem clara e evita blefes.',
};

export function ehPerfilDoCoach(valor: unknown): valor is PerfilDoCoach {
  return typeof valor === 'string' && (PERFIS_DO_COACH as readonly string[]).includes(valor);
}

/**
 * `decisao`: é a vez do jogador; vêm números, possibilidades e a recomendação do agente.
 * `leitura`: a qualquer momento da mão (nova carta na mesa); vêm números e um comentário
 * curto da IA sobre a mão, sem recomendar jogada.
 */
export type ModoDoCoach = 'decisao' | 'leitura';

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
  readonly modo: ModoDoCoach;
  readonly perfil: PerfilDoCoach;
  readonly fase: string;
  /** Quantas cartas comunitárias havia: identifica a etapa da mão. */
  readonly cartasNaMesa: number;
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
  /** Vazio no modo `leitura` (não é a vez do jogador). */
  readonly possibilidades: readonly PossibilidadeDeJogada[];
}

export interface RecomendacaoDoCoach {
  readonly numeroDaMao: number;
  readonly momento: number;
  readonly perfil: PerfilDoCoach;
  /** `ia` = gerada pelo agente (Claude ou modelo local); `regras` = coach determinístico. */
  readonly fonte: 'ia' | 'regras';
  /** Modelo de IA que gerou a recomendação, ou null quando veio das regras. */
  readonly modelo: string | null;
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

/** Comentário curto da IA sobre a mão atual, a cada nova etapa (modo `leitura`). */
export interface LeituraDoCoach {
  readonly numeroDaMao: number;
  readonly cartasNaMesa: number;
  readonly perfil: PerfilDoCoach;
  readonly fonte: 'ia' | 'regras';
  readonly modelo: string | null;
  /** O que o jogador tem agora e quão forte é. */
  readonly leitura: string;
  /** O que fazer se apostarem, ou se a mesa ficar parada, de acordo com o perfil. */
  readonly plano: string;
  readonly aviso: string | null;
}

/** Pedido do cliente ao coach. */
export interface PedidoAoCoach {
  readonly modo: ModoDoCoach;
  readonly perfil: PerfilDoCoach;
}

/** Campos de texto que a IA já escreveu, enquanto ainda escreve (podem estar pela metade). */
export interface TextoParcialDoCoach {
  readonly acao?: string;
  readonly valor?: number | null;
  readonly resumo?: string;
  readonly explicacao?: string;
  readonly conceito?: string;
  readonly leitura?: string;
  readonly plano?: string;
}

/**
 * O coach escrevendo ao vivo: os passos que o agente já deu e o texto que a IA está
 * gerando agora. Chega várias vezes por segundo, até a resposta final (recomendação ou
 * leitura) chegar completa e validada.
 */
export interface EscritaDoCoach {
  readonly modo: ModoDoCoach;
  readonly numeroDaMao: number;
  /** Identifica a decisão (modo `decisao`). */
  readonly momento: number;
  /** Identifica a etapa da mão (modo `leitura`). */
  readonly cartasNaMesa: number;
  readonly perfil: PerfilDoCoach;
  /** Passos do agente até agora, em ordem (ex.: "Calculei a equity contra 1 adversário: 54%"). */
  readonly etapas: readonly string[];
  readonly texto: TextoParcialDoCoach;
}
