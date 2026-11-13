/**
 * Calculadora de equity por simulação Monte Carlo.
 *
 * Equity é a fatia do pote que uma mão "vale" em média: a chance de ganhar mais a parte
 * dos empates. Como não sabemos as cartas dos adversários (e não devemos saber), a
 * simulação sorteia milhares de cenários possíveis com as cartas que restam e conta
 * quantas vezes a mão do jogador ganha.
 *
 * Só usa o que o jogador vê: as próprias cartas e as da mesa.
 */
import {
  CATEGORIAS,
  avaliarMao,
  vencedores,
  type AvaliacaoDeMao,
  type CategoriaDeMao,
} from '@poker/hand-evaluator';
import { NAIPES, VALORES, formatarCarta, type Carta } from '@poker/shared-types';

export interface ParametrosDeEquity {
  /** As 2 cartas do jogador. */
  readonly minhasCartas: readonly Carta[];
  /** 0, 3, 4 ou 5 cartas comunitárias. */
  readonly cartasNaMesa: readonly Carta[];
  /** Quantos adversários ainda estão na mão (1 a 9). Suas cartas são sorteadas. */
  readonly oponentes: number;
  /** Número de cenários simulados. Mais = mais preciso e mais lento. Padrão: 10.000. */
  readonly simulacoes?: number;
  /** Fonte de números em [0, 1). Padrão: Math.random (aqui não precisa ser criptográfico). */
  readonly aleatorio?: () => number;
}

export interface ResultadoDeEquity {
  /** Chance de ganhar sozinho. */
  readonly vitoria: number;
  /** Chance de empatar (dividir o pote). */
  readonly empate: number;
  /** Fatia média do pote: vitória + parte dos empates. */
  readonly equity: number;
  readonly oponentes: number;
  readonly simulacoes: number;
  /** Chance de a mão do jogador terminar (no river) em cada categoria. */
  readonly categoriasFinais: Readonly<Record<CategoriaDeMao, number>>;
}

const BARALHO: readonly Carta[] = VALORES.flatMap((valor) =>
  NAIPES.map((naipe) => ({ valor, naipe })),
);

export function calcularEquity(p: ParametrosDeEquity): ResultadoDeEquity {
  const simulacoes = p.simulacoes ?? 10_000;
  const aleatorio = p.aleatorio ?? Math.random;
  validar(p, simulacoes);

  const conhecidas = new Set([...p.minhasCartas, ...p.cartasNaMesa].map(formatarCarta));
  const restantes = BARALHO.filter((c) => !conhecidas.has(formatarCarta(c)));
  const faltamNaMesa = 5 - p.cartasNaMesa.length;
  const precisa = faltamNaMesa + 2 * p.oponentes;

  let vitorias = 0;
  let empates = 0;
  let fatiaDoPote = 0;
  const categorias = new Map<CategoriaDeMao, number>(CATEGORIAS.map((c) => [c, 0]));
  const pilha = [...restantes];

  for (let s = 0; s < simulacoes; s++) {
    // Fisher-Yates parcial: embaralha só as primeiras `precisa` posições.
    for (let i = 0; i < precisa; i++) {
      const j = i + Math.floor(aleatorio() * (pilha.length - i));
      [pilha[i], pilha[j]] = [pilha[j] as Carta, pilha[i] as Carta];
    }

    const mesa = [...p.cartasNaMesa, ...pilha.slice(0, faltamNaMesa)];
    const minha = avaliarMao([...p.minhasCartas, ...mesa]);
    const maos: AvaliacaoDeMao[] = [minha];
    for (let o = 0; o < p.oponentes; o++) {
      const inicio = faltamNaMesa + 2 * o;
      maos.push(avaliarMao([...pilha.slice(inicio, inicio + 2), ...mesa]));
    }

    categorias.set(minha.categoria, (categorias.get(minha.categoria) ?? 0) + 1);
    const ganhadores = vencedores(maos);
    if (ganhadores.includes(0)) {
      if (ganhadores.length === 1) vitorias++;
      else empates++;
      fatiaDoPote += 1 / ganhadores.length;
    }
  }

  return {
    vitoria: vitorias / simulacoes,
    empate: empates / simulacoes,
    equity: fatiaDoPote / simulacoes,
    oponentes: p.oponentes,
    simulacoes,
    categoriasFinais: Object.fromEntries(
      CATEGORIAS.map((c) => [c, (categorias.get(c) ?? 0) / simulacoes]),
    ) as Record<CategoriaDeMao, number>,
  };
}

function validar(p: ParametrosDeEquity, simulacoes: number): void {
  if (p.minhasCartas.length !== 2)
    throw new Error('São necessárias exatamente 2 cartas do jogador.');
  if (![0, 3, 4, 5].includes(p.cartasNaMesa.length)) {
    throw new Error(`A mesa deve ter 0, 3, 4 ou 5 cartas; tem ${p.cartasNaMesa.length}.`);
  }
  if (!Number.isInteger(p.oponentes) || p.oponentes < 1 || p.oponentes > 9) {
    throw new Error(`Número de oponentes inválido: ${p.oponentes}.`);
  }
  if (!Number.isInteger(simulacoes) || simulacoes < 1 || simulacoes > 200_000) {
    throw new Error(`Número de simulações inválido: ${simulacoes}.`);
  }
  const todas = [...p.minhasCartas, ...p.cartasNaMesa].map(formatarCarta);
  if (new Set(todas).size !== todas.length) throw new Error('Cartas repetidas na entrada.');
}

/**
 * Equity mínima para que pagar seja lucrativo no longo prazo ("pot odds"):
 * o que se paga dividido pelo pote final. Ex.: pagar 50 num pote de 100 → 50/150 = 33%.
 */
export function equityNecessaria(paraPagar: number, poteAntes: number): number {
  if (paraPagar <= 0) return 0;
  return paraPagar / (poteAntes + paraPagar);
}
