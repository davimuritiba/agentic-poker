import { formatarCarta, type Carta, type Valor } from '@poker/shared-types';

/** Categorias de mão, da mais fraca para a mais forte. A posição no array é a força. */
export const CATEGORIAS = [
  'carta-alta',
  'par',
  'dois-pares',
  'trinca',
  'sequencia',
  'flush',
  'full-house',
  'quadra',
  'straight-flush',
] as const;

export type CategoriaDeMao = (typeof CATEGORIAS)[number];

export const NOMES_DAS_CATEGORIAS: Record<CategoriaDeMao, string> = {
  'carta-alta': 'Carta alta',
  par: 'Par',
  'dois-pares': 'Dois pares',
  trinca: 'Trinca',
  sequencia: 'Sequência',
  flush: 'Flush',
  'full-house': 'Full house',
  quadra: 'Quadra',
  'straight-flush': 'Straight flush',
};

export interface AvaliacaoDeMao {
  readonly categoria: CategoriaDeMao;
  /**
   * Valores que desempatam duas mãos da mesma categoria, do mais importante para o
   * menos. Exemplo: dois pares de Reis e 7 com kicker Ás = [13, 7, 14].
   * Numa sequência, só a carta mais alta importa; na sequência A-2-3-4-5 ela é o 5.
   */
  readonly desempate: readonly Valor[];
  /** As 5 cartas que formam a mão, na ordem de importância para o desempate. */
  readonly cartas: readonly Carta[];
  /**
   * Número que resume a mão: quanto maior, mais forte. Duas mãos empatam se, e só se,
   * têm a mesma força. Permite comparar e ordenar mãos com uma subtração.
   */
  readonly forca: number;
}

/**
 * Avalia a melhor mão de 5 cartas que dá para formar com 5, 6 ou 7 cartas
 * (no Hold'em: as 2 cartas do jogador mais as cartas comunitárias da mesa).
 */
export function avaliarMao(entrada: readonly Carta[]): AvaliacaoDeMao {
  validarEntrada(entrada);

  const ordenadas = [...entrada].sort((a, b) => b.valor - a.valor);
  const doFlush = cartasDoFlush(ordenadas);

  if (doFlush) {
    const sequencia = acharSequencia(doFlush);
    if (sequencia) return montar('straight-flush', [sequencia.topo], sequencia.cartas);
  }

  // Grupos de cartas de mesmo valor: primeiro os maiores grupos, depois os valores mais altos.
  const grupos = agruparPorValor(ordenadas);
  const [maior, segundo] = grupos as [Carta[], Carta[] | undefined];
  const valorDe = (grupo: readonly Carta[]) => (grupo[0] as Carta).valor;

  if (maior.length === 4) {
    const [kicker] = semValores(ordenadas, [maior]);
    return montar('quadra', [valorDe(maior), (kicker as Carta).valor], [...maior, kicker as Carta]);
  }

  if (maior.length === 3 && segundo && segundo.length >= 2) {
    // Com duas trincas, a menor entra como o par do full house.
    const par = segundo.slice(0, 2);
    return montar('full-house', [valorDe(maior), valorDe(par)], [...maior, ...par]);
  }

  if (doFlush) {
    const cinco = doFlush.slice(0, 5);
    return montar('flush', valores(cinco), cinco);
  }

  const sequencia = acharSequencia(ordenadas);
  if (sequencia) return montar('sequencia', [sequencia.topo], sequencia.cartas);

  if (maior.length === 3) {
    const kickers = semValores(ordenadas, [maior]).slice(0, 2);
    return montar('trinca', [valorDe(maior), ...valores(kickers)], [...maior, ...kickers]);
  }

  if (maior.length === 2 && segundo && segundo.length === 2) {
    // Com três pares, o kicker pode vir do terceiro par.
    const [kicker] = semValores(ordenadas, [maior, segundo]);
    return montar(
      'dois-pares',
      [valorDe(maior), valorDe(segundo), (kicker as Carta).valor],
      [...maior, ...segundo, kicker as Carta],
    );
  }

  if (maior.length === 2) {
    const kickers = semValores(ordenadas, [maior]).slice(0, 3);
    return montar('par', [valorDe(maior), ...valores(kickers)], [...maior, ...kickers]);
  }

  const cinco = ordenadas.slice(0, 5);
  return montar('carta-alta', valores(cinco), cinco);
}

/** Negativo se `a` perde, zero se empata, positivo se `a` ganha. */
export function compararMaos(a: AvaliacaoDeMao, b: AvaliacaoDeMao): number {
  return a.forca - b.forca;
}

/**
 * Índices das mãos vencedoras. Mais de um índice significa empate (pote dividido).
 * Exemplo: vencedores([fraca, forte, forte]) = [1, 2].
 */
export function vencedores(maos: readonly AvaliacaoDeMao[]): number[] {
  const maiorForca = Math.max(...maos.map((m) => m.forca));
  return maos.flatMap((m, i) => (m.forca === maiorForca ? [i] : []));
}

function validarEntrada(entrada: readonly Carta[]): void {
  if (entrada.length < 5 || entrada.length > 7) {
    throw new Error(`Uma mão precisa de 5 a 7 cartas; recebeu ${entrada.length}.`);
  }
  const vistas = new Set<string>();
  for (const c of entrada) {
    const notacao = formatarCarta(c);
    if (vistas.has(notacao)) throw new Error(`Carta repetida na mão: "${notacao}".`);
    vistas.add(notacao);
  }
}

/** Cartas do naipe que tem 5 ou mais cartas, ainda em ordem decrescente, ou `undefined`. */
function cartasDoFlush(ordenadas: readonly Carta[]): Carta[] | undefined {
  const porNaipe = Map.groupBy(ordenadas, (c) => c.naipe);
  return [...porNaipe.values()].find((grupo) => grupo.length >= 5);
}

function agruparPorValor(ordenadas: readonly Carta[]): Carta[][] {
  const porValor = Map.groupBy(ordenadas, (c) => c.valor);
  return [...porValor.values()].sort(
    (a, b) => b.length - a.length || (b[0] as Carta).valor - (a[0] as Carta).valor,
  );
}

/**
 * Procura a sequência mais alta de 5 valores consecutivos. O Ás conta como carta mais
 * alta (10-J-Q-K-A) e também como 1, na sequência mais baixa (A-2-3-4-5).
 */
function acharSequencia(ordenadas: readonly Carta[]): { topo: Valor; cartas: Carta[] } | undefined {
  const umaPorValor: Carta[] = [];
  for (const c of ordenadas) {
    if (umaPorValor.at(-1)?.valor !== c.valor) umaPorValor.push(c);
  }

  // O Ás repetido no fim da lista, valendo 1.
  const as = umaPorValor[0]?.valor === 14 ? umaPorValor[0] : undefined;
  const lista = as ? [...umaPorValor, as] : umaPorValor;
  const valorNaPosicao = (i: number) => (i >= umaPorValor.length ? 1 : (lista[i] as Carta).valor);

  for (let inicio = 0; inicio + 4 < lista.length; inicio++) {
    let consecutivas = true;
    for (let k = 1; k <= 4; k++) {
      if (valorNaPosicao(inicio + k) !== valorNaPosicao(inicio) - k) {
        consecutivas = false;
        break;
      }
    }
    if (consecutivas) {
      return { topo: valorNaPosicao(inicio) as Valor, cartas: lista.slice(inicio, inicio + 5) };
    }
  }
  return undefined;
}

function semValores(ordenadas: readonly Carta[], grupos: readonly Carta[][]): Carta[] {
  const usados = new Set(grupos.map((g) => (g[0] as Carta).valor));
  return ordenadas.filter((c) => !usados.has(c.valor));
}

function valores(lista: readonly Carta[]): Valor[] {
  return lista.map((c) => c.valor);
}

/** Base 15 cabe todos os valores (2 a 14) sem colisão entre posições. */
const BASE = 15;

function montar(categoria: CategoriaDeMao, desempate: Valor[], cartas: Carta[]): AvaliacaoDeMao {
  let forca = CATEGORIAS.indexOf(categoria);
  for (let i = 0; i < 5; i++) forca = forca * BASE + (desempate[i] ?? 0);
  return { categoria, desempate, cartas, forca };
}
