/**
 * Análise numérica determinística: equity por Monte Carlo, pot odds e uma avaliação de
 * cada jogada possível. É o que o coach mostra na hora, e são as "ferramentas" que o
 * agente de IA usa em vez de chutar números.
 */
import { calcularEquity, equityNecessaria, type ResultadoDeEquity } from '@poker/equity';
import {
  NOMES_DAS_CATEGORIAS,
  avaliarMao,
  descreverMao,
  type CategoriaDeMao,
} from '@poker/hand-evaluator';
import type { AnaliseDoCoach, Carta, PossibilidadeDeJogada } from '@poker/shared-types';
import type { ContextoDoJogador } from './contexto.js';

export interface OpcoesDeAnalise {
  readonly simulacoes?: number;
  readonly aleatorio?: () => number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function analisar(c: ContextoDoJogador, o: OpcoesDeAnalise = {}): AnaliseDoCoach {
  const eq = equidadeContra(c, c.oponentes.length, o);
  const necessaria = c.paraPagar > 0 ? equityNecessaria(c.paraPagar, c.pote) : null;

  return {
    numeroDaMao: c.numeroDaMao,
    momento: c.momento,
    fase: c.fase,
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
    possibilidades: avaliarPossibilidades(c, eq.equity, necessaria),
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

/** Tamanho sugerido para apostar/aumentar: cerca de 2/3 do pote, dentro do permitido. */
export function tamanhoSugerido(c: ContextoDoJogador, tipo: 'apostar' | 'aumentar'): number | null {
  const intervalo = c.acoes[tipo];
  if (!intervalo) return null;
  const desejado =
    tipo === 'apostar'
      ? Math.round((c.pote * 2) / 3)
      : Math.round(c.maiorAposta + ((c.pote + c.paraPagar) * 3) / 4);
  return Math.min(Math.max(desejado, intervalo.minimo), intervalo.maximo);
}

export function avaliarPossibilidades(
  c: ContextoDoJogador,
  equity: number,
  necessaria: number | null,
): PossibilidadeDeJogada[] {
  const { acoes } = c;
  const lista: PossibilidadeDeJogada[] = [];
  const contra = c.oponentes.length === 1 ? '1 adversário' : `${c.oponentes.length} adversários`;

  if (acoes.desistir) {
    if (c.paraPagar === 0) {
      lista.push({
        acao: 'desistir',
        valor: null,
        avaliacao: 'ruim',
        motivo: 'Passar é de graça: desistir só joga a mão fora.',
      });
    } else if (necessaria !== null && equity < necessaria) {
      lista.push({
        acao: 'desistir',
        valor: null,
        avaliacao: 'boa',
        motivo: `Pagar exige ${pct(necessaria)} de equity e você tem ${pct(equity)}.`,
      });
    } else {
      lista.push({
        acao: 'desistir',
        valor: null,
        avaliacao: 'ruim',
        motivo: `Sua equity (${pct(equity)}) já cobre o preço do pote (${pct(necessaria ?? 0)}).`,
      });
    }
  }

  if (acoes.passar) {
    lista.push(
      equity >= 0.65
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

  if (acoes.pagar !== undefined && necessaria !== null) {
    const margem = equity - necessaria;
    lista.push({
      acao: 'pagar',
      valor: c.minhaAposta + acoes.pagar,
      avaliacao: margem >= 0.05 ? 'boa' : margem > -0.05 ? 'neutra' : 'ruim',
      motivo: `Precisa de ${pct(necessaria)} de equity e você tem ${pct(equity)} contra ${contra}.${margem > -0.05 && margem < 0.05 ? ' Decisão apertada.' : ''}`,
    });
  }

  for (const tipo of ['apostar', 'aumentar'] as const) {
    const valor = tamanhoSugerido(c, tipo);
    if (valor === null) continue;
    lista.push({
      acao: tipo,
      valor,
      avaliacao: equity >= 0.6 ? 'boa' : equity >= 0.45 ? 'neutra' : 'ruim',
      motivo:
        equity >= 0.6
          ? `Por valor: com ${pct(equity)} você é favorito contra ${contra}.`
          : equity >= 0.45
            ? `Equilibrado (${pct(equity)}): pode proteger a mão, mas arrisca fichas.`
            : `Seria um blefe com ${pct(equity)} contra ${contra}: arriscado.`,
    });
  }

  if (acoes.allIn !== undefined) {
    const stackCurto = c.meuStack <= c.pote * 0.5;
    lista.push({
      acao: 'all-in',
      valor: acoes.allIn,
      avaliacao:
        equity >= 0.7 || (stackCurto && equity >= 0.5) ? 'boa' : equity >= 0.55 ? 'neutra' : 'ruim',
      motivo: stackCurto
        ? `Stack curto em relação ao pote: com ${pct(equity)}, ir all-in simplifica a decisão.`
        : `Arrisca o stack inteiro (${c.meuStack}) com ${pct(equity)} de equity.`,
    });
  }

  return lista;
}
