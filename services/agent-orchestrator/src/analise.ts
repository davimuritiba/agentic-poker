/**
 * Análise numérica determinística: equity por Monte Carlo, pot odds e uma avaliação de
 * cada jogada possível, de acordo com o perfil do coach. É o que o coach mostra na hora, e
 * são as "ferramentas" que o agente de IA usa em vez de chutar números.
 */
import { calcularEquity, equityNecessaria, type ResultadoDeEquity } from '@poker/equity';
import {
  NOMES_DAS_CATEGORIAS,
  avaliarMao,
  descreverMao,
  type CategoriaDeMao,
} from '@poker/hand-evaluator';
import {
  PERFIL_RECOMENDADO,
  type AnaliseDoCoach,
  type Carta,
  type PerfilDoCoach,
  type PossibilidadeDeJogada,
} from '@poker/shared-types';
import type { ContextoDoJogador } from './contexto.js';

export interface OpcoesDeAnalise {
  readonly simulacoes?: number;
  readonly aleatorio?: () => number;
}

/**
 * O que muda de um perfil para outro. As equities são contra mãos aleatórias; as margens
 * comparam a equity com o necessário para pagar (pot odds).
 */
export interface ParametrosDoPerfil {
  /** Equity a partir da qual apostar/aumentar é "boa" (por valor). */
  readonly subirBom: number;
  /** Equity a partir da qual apostar/aumentar é "neutra" (proteção, semi-blefe). */
  readonly subirNeutro: number;
  /** Margem sobre as pot odds para pagar ser "boa"; abaixo de `pagarNeutro`, "ruim". */
  readonly pagarBom: number;
  readonly pagarNeutro: number;
  /** Equity a partir da qual ir all-in é "bom" ou "neutro". */
  readonly allInBom: number;
  readonly allInNeutro: number;
  /** Com equity acima disto, passar deixa fichas na mesa (avaliação "neutra"). */
  readonly passarDeixaValor: number;
  /** Tamanho da aposta em fração do pote, e do aumento em fração do pote depois de pagar. */
  readonly fracaoDaAposta: number;
  readonly fracaoDoAumento: number;
}

export const PARAMETROS_DOS_PERFIS: Record<PerfilDoCoach, ParametrosDoPerfil> = {
  agressivo: {
    subirBom: 0.5,
    subirNeutro: 0.35,
    pagarBom: 0,
    pagarNeutro: -0.08,
    allInBom: 0.6,
    allInNeutro: 0.45,
    passarDeixaValor: 0.55,
    fracaoDaAposta: 0.8,
    fracaoDoAumento: 1,
  },
  equilibrado: {
    subirBom: 0.6,
    subirNeutro: 0.45,
    pagarBom: 0.05,
    pagarNeutro: -0.05,
    allInBom: 0.7,
    allInNeutro: 0.55,
    passarDeixaValor: 0.65,
    fracaoDaAposta: 2 / 3,
    fracaoDoAumento: 0.75,
  },
  seguro: {
    subirBom: 0.72,
    subirNeutro: 0.6,
    pagarBom: 0.1,
    pagarNeutro: 0.02,
    allInBom: 0.82,
    allInNeutro: 0.7,
    passarDeixaValor: 0.78,
    fracaoDaAposta: 0.5,
    fracaoDoAumento: 0.6,
  },
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function analisar(
  c: ContextoDoJogador,
  o: OpcoesDeAnalise = {},
  perfil: PerfilDoCoach = PERFIL_RECOMENDADO,
): AnaliseDoCoach {
  const eq = equidadeContra(c, c.oponentes.length, o);
  const necessaria = c.paraPagar > 0 ? equityNecessaria(c.paraPagar, c.pote) : null;

  return {
    numeroDaMao: c.numeroDaMao,
    momento: c.momento,
    modo: c.minhaVez ? 'decisao' : 'leitura',
    perfil,
    fase: c.fase,
    cartasNaMesa: c.cartasNaMesa.length,
    maoAtual: descreverMaoAtual(c.minhasCartas, c.cartasNaMesa),
    oponentes: eq.oponentes,
    vitoria: eq.vitoria,
    empate: eq.empate,
    equity: eq.equity,
    simulacoes: eq.simulacoes,
    chancesFinais: chancesFinais(eq, c.cartasNaMesa.length),
    pote: c.pote,
    paraPagar: c.paraPagar,
    equityNecessaria: necessaria,
    posicao: c.posicao,
    possibilidades: c.minhaVez ? avaliarPossibilidades(c, eq.equity, necessaria, perfil) : [],
  };
}

export function equidadeContra(
  c: ContextoDoJogador,
  oponentes: number,
  o: OpcoesDeAnalise = {},
): ResultadoDeEquity {
  return calcularEquity({
    minhasCartas: c.minhasCartas,
    cartasNaMesa: c.cartasNaMesa,
    oponentes: Math.min(Math.max(1, Math.round(oponentes)), 9),
    simulacoes: o.simulacoes ?? 6_000,
    aleatorio: o.aleatorio,
  });
}

export function descreverMaoAtual(minhas: readonly Carta[], mesa: readonly Carta[]): string {
  if (mesa.length >= 3) return descreverMao(avaliarMao([...minhas, ...mesa]));
  const [a, b] = minhas;
  if (!a || !b) return '—';
  const nome = (v: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[v] ?? String(v);
  if (a.valor === b.valor) return `Par de ${nome(a.valor)} na mão`;
  const [alta, baixa] = a.valor > b.valor ? [a, b] : [b, a];
  const naipe = a.naipe === b.naipe ? 'do mesmo naipe' : 'de naipes diferentes';
  return `${nome(alta.valor)}-${nome(baixa.valor)} ${naipe}`;
}

/** As categorias mais prováveis no river (só as que importam: par ou melhor, ou carta alta). */
function chancesFinais(eq: ResultadoDeEquity, cartasNaMesa: number) {
  if (cartasNaMesa === 5) return [];
  return (Object.entries(eq.categoriasFinais) as [CategoriaDeMao, number][])
    .filter(([, chance]) => chance >= 0.02)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([categoria, chance]) => ({ mao: NOMES_DAS_CATEGORIAS[categoria], chance }));
}

/** Tamanho sugerido para apostar/aumentar, conforme o perfil, dentro do permitido. */
export function tamanhoSugerido(
  c: ContextoDoJogador,
  tipo: 'apostar' | 'aumentar',
  perfil: PerfilDoCoach = PERFIL_RECOMENDADO,
): number | null {
  const intervalo = c.acoes[tipo];
  if (!intervalo) return null;
  const p = PARAMETROS_DOS_PERFIS[perfil];
  const desejado =
    tipo === 'apostar'
      ? Math.round(c.pote * p.fracaoDaAposta)
      : Math.round(c.maiorAposta + (c.pote + c.paraPagar) * p.fracaoDoAumento);
  return Math.min(Math.max(desejado, intervalo.minimo), intervalo.maximo);
}

export function avaliarPossibilidades(
  c: ContextoDoJogador,
  equity: number,
  necessaria: number | null,
  perfil: PerfilDoCoach = PERFIL_RECOMENDADO,
): PossibilidadeDeJogada[] {
  const p = PARAMETROS_DOS_PERFIS[perfil];
  const { acoes } = c;
  const lista: PossibilidadeDeJogada[] = [];
  const contra = c.oponentes.length === 1 ? '1 adversário' : `${c.oponentes.length} adversários`;
  const margem = necessaria === null ? null : equity - necessaria;

  if (acoes.desistir) {
    if (c.paraPagar === 0 || margem === null) {
      lista.push({
        acao: 'desistir',
        valor: null,
        avaliacao: 'ruim',
        motivo: 'Passar é de graça: desistir só joga a mão fora.',
      });
    } else {
      // Desistir é bom quando pagar seria ruim para este perfil.
      const pagarSeriaRuim = margem < p.pagarNeutro;
      lista.push({
        acao: 'desistir',
        valor: null,
        avaliacao: pagarSeriaRuim ? 'boa' : margem < p.pagarBom ? 'neutra' : 'ruim',
        motivo: pagarSeriaRuim
          ? `Pagar exige ${pct(necessaria ?? 0)} de equity e você tem ${pct(equity)}.`
          : `Sua equity (${pct(equity)}) cobre o preço do pote (${pct(necessaria ?? 0)}).`,
      });
    }
  }

  if (acoes.passar) {
    lista.push(
      equity >= p.passarDeixaValor
        ? {
            acao: 'passar',
            valor: null,
            avaliacao: 'neutra',
            motivo: `Mão forte (${pct(equity)}): apostar pode tirar mais fichas dos adversários.`,
          }
        : {
            acao: 'passar',
            valor: null,
            avaliacao: 'boa',
            motivo:
              c.cartasNaMesa.length === 5
                ? 'Vai ao showdown sem gastar mais fichas.'
                : 'Vê a próxima carta de graça.',
          },
    );
  }

  if (acoes.pagar !== undefined && margem !== null && necessaria !== null) {
    const apertada = margem >= p.pagarNeutro && margem < p.pagarBom;
    lista.push({
      acao: 'pagar',
      valor: c.minhaAposta + acoes.pagar,
      avaliacao: margem >= p.pagarBom ? 'boa' : margem >= p.pagarNeutro ? 'neutra' : 'ruim',
      motivo: `Precisa de ${pct(necessaria)} de equity e você tem ${pct(equity)} contra ${contra}.${apertada ? ' Decisão apertada.' : ''}`,
    });
  }

  for (const tipo of ['apostar', 'aumentar'] as const) {
    const valor = tamanhoSugerido(c, tipo, perfil);
    if (valor === null) continue;
    lista.push({
      acao: tipo,
      valor,
      avaliacao: equity >= p.subirBom ? 'boa' : equity >= p.subirNeutro ? 'neutra' : 'ruim',
      motivo:
        equity >= p.subirBom
          ? `Por valor: com ${pct(equity)} você é favorito contra ${contra}.`
          : equity >= p.subirNeutro
            ? `Pressão com ${pct(equity)}: protege a mão e pode fazer o adversário desistir.`
            : `Seria um blefe com ${pct(equity)} contra ${contra}: arriscado.`,
    });
  }

  if (acoes.allIn !== undefined) {
    const stackCurto = c.meuStack <= c.pote * 0.5;
    const bom = equity >= p.allInBom || (stackCurto && equity >= p.allInNeutro);
    lista.push({
      acao: 'all-in',
      valor: acoes.allIn,
      avaliacao: bom ? 'boa' : equity >= p.allInNeutro ? 'neutra' : 'ruim',
      motivo: stackCurto
        ? `Stack curto em relação ao pote: com ${pct(equity)}, ir all-in simplifica a decisão.`
        : `Arrisca o stack inteiro (${c.meuStack}) com ${pct(equity)} de equity.`,
    });
  }

  return lista;
}
