/**
 * Máquina de estados de uma mão de Texas Hold'em No-Limit.
 *
 * Funções puras: recebem um estado e devolvem um estado novo, sem alterar o anterior,
 * sem rede, sem relógio. Toda regra do jogo mora aqui; quem chama (a mesa ao vivo,
 * os testes, um bot de playtest) só escolhe as ações.
 *
 *   iniciarMao → blinds, 2 cartas para cada um, primeira vez de agir
 *   aplicarAcao → valida, aplica, passa a vez, abre flop/turn/river, faz o showdown
 */
import { acoesPermitidas, validarAcao, type SituacaoDeAposta } from '@poker/action-validator';
import { baralhoEmbaralhado, distribuir } from '@poker/deck';
import { avaliarMao, descreverMao, vencedores, type AvaliacaoDeMao } from '@poker/hand-evaluator';
import {
  ehQuantidadeDeFichasValida,
  type Acao,
  type AcoesPermitidas,
  type EventoDaMao,
  type Fichas,
  type PoteResolvido,
} from '@poker/shared-types';
import { calcularPotes } from './potes.js';
import type { EstadoDaMao, JogadorNaMao, ParametrosDaMao, ResultadoDaJogada } from './tipos.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };
type JogadorMutavel = Mutavel<JogadorNaMao>;
interface EstadoMutavel extends Omit<Mutavel<EstadoDaMao>, 'jogadores' | 'eventos'> {
  jogadores: JogadorMutavel[];
  eventos: EventoDaMao[];
}

/** Cópia rasa suficiente para alterar sem mexer no estado original. */
function copiar(e: EstadoDaMao): EstadoMutavel {
  return { ...e, jogadores: e.jogadores.map((j) => ({ ...j })), eventos: [...e.eventos] };
}

export function iniciarMao(p: ParametrosDaMao): EstadoDaMao {
  const { smallBlind, bigBlind } = p.config;
  if (
    !ehQuantidadeDeFichasValida(smallBlind) ||
    !ehQuantidadeDeFichasValida(bigBlind) ||
    bigBlind === 0 ||
    smallBlind > bigBlind
  ) {
    throw new Error(`Blinds inválidos: ${smallBlind}/${bigBlind}.`);
  }
  if (p.jogadores.length < 2) throw new Error('Uma mão precisa de pelo menos 2 jogadores.');
  if (new Set(p.jogadores.map((j) => j.id)).size !== p.jogadores.length) {
    throw new Error('Ids de jogadores repetidos.');
  }
  if (new Set(p.jogadores.map((j) => j.assento)).size !== p.jogadores.length) {
    throw new Error('Assentos repetidos.');
  }
  for (const j of p.jogadores) {
    if (!ehQuantidadeDeFichasValida(j.stack) || j.stack === 0) {
      throw new Error(`Jogador ${j.id} sem fichas válidas para jogar (${j.stack}).`);
    }
  }

  const ordenados = [...p.jogadores].sort((a, b) => a.assento - b.assento);
  const n = ordenados.length;
  const botao = ordenados.findIndex((j) => j.assento === p.assentoDoBotao);
  if (botao === -1) throw new Error(`Ninguém sentado no assento do botão (${p.assentoDoBotao}).`);

  // Distribui 2 cartas para cada um, começando à esquerda do botão.
  let baralho = p.baralho ?? baralhoEmbaralhado();
  const cartasDe: JogadorNaMao['cartas'][] = new Array(n);
  for (let k = 1; k <= n; k++) {
    const r = distribuir(baralho, 2);
    cartasDe[(botao + k) % n] = r.cartas;
    baralho = r.restante;
  }

  const e: EstadoMutavel = {
    config: p.config,
    fase: 'pre-flop',
    jogadores: ordenados.map((j, i) => ({
      id: j.id,
      assento: j.assento,
      stack: j.stack,
      apostaNaRodada: 0,
      totalApostado: 0,
      cartas: cartasDe[i] ?? [],
      situacao: 'ativo',
      jaAgiu: false,
      apostaQuandoAgiu: 0,
    })),
    botao,
    cartasNaMesa: [],
    baralho,
    // Mesmo que o big blind esteja all-in com menos, quem entra paga o big blind inteiro.
    maiorAposta: bigBlind,
    aumentoMinimo: bigBlind,
    vez: null,
    eventos: [{ tipo: 'inicio', botao: (ordenados[botao] as JogadorNaMao).id }],
    resultado: null,
  };

  // No heads-up (2 jogadores), o botão é o small blind e age primeiro no pré-flop.
  const sb = n === 2 ? botao : (botao + 1) % n;
  const bb = (sb + 1) % n;
  postarBlind(e, sb, smallBlind, 'small');
  postarBlind(e, bb, bigBlind, 'big');

  avancar(e, (bb + 1) % n);
  return e;
}

/** Monta a situação de aposta do jogador no índice `i`, no formato do action-validator. */
export function situacaoDeAposta(e: EstadoDaMao, i: number): SituacaoDeAposta {
  const j = e.jogadores[i];
  if (!j) throw new Error(`Não há jogador no índice ${i}.`);
  return {
    stack: j.stack,
    apostaDoJogador: j.apostaNaRodada,
    maiorAposta: e.maiorAposta,
    aumentoMinimo: e.aumentoMinimo,
    // Pode aumentar se ainda não agiu desde o último aumento completo, ou se os all-ins
    // menores que vieram depois somam, juntos, pelo menos um aumento completo.
    podeAumentar: !j.jaAgiu || e.maiorAposta - j.apostaQuandoAgiu >= e.aumentoMinimo,
  };
}

/** Ações permitidas para quem tem a vez, ou null se a mão terminou. */
export function acoesDaVez(e: EstadoDaMao): AcoesPermitidas | null {
  return e.vez === null ? null : acoesPermitidas(situacaoDeAposta(e, e.vez));
}

export function aplicarAcao(estado: EstadoDaMao, jogadorId: string, acao: Acao): ResultadoDaJogada {
  if (estado.fase === 'encerrada' || estado.vez === null) {
    return { ok: false, motivo: 'A mão já terminou.' };
  }
  const vez = estado.vez;
  if ((estado.jogadores[vez] as JogadorNaMao).id !== jogadorId) {
    return { ok: false, motivo: 'Não é a sua vez.' };
  }

  const validacao = validarAcao(situacaoDeAposta(estado, vez), acao);
  if (!validacao.valida) return { ok: false, motivo: validacao.motivo };
  const efeito = validacao.efeito;

  const e = copiar(estado);
  const j = e.jogadores[vez] as JogadorMutavel;
  j.stack -= efeito.fichasColocadas;
  j.apostaNaRodada = efeito.apostaTotal;
  j.totalApostado += efeito.fichasColocadas;
  j.jaAgiu = true;
  j.apostaQuandoAgiu = efeito.novaMaiorAposta;
  if (efeito.tipo === 'desistir') j.situacao = 'desistiu';
  else if (efeito.allIn) j.situacao = 'all-in';

  // Aumento completo: todo mundo que ainda tem fichas volta a precisar agir.
  if (efeito.reabreAcao) {
    for (const outro of e.jogadores)
      if (outro !== j && outro.situacao === 'ativo') outro.jaAgiu = false;
  }
  e.maiorAposta = efeito.novaMaiorAposta;
  e.aumentoMinimo = efeito.novoAumentoMinimo;
  e.eventos.push({
    tipo: 'acao',
    jogadorId,
    acao: efeito.tipo,
    apostaTotal: efeito.apostaTotal,
    allIn: efeito.allIn,
  });

  avancar(e, (vez + 1) % e.jogadores.length);
  return { ok: true, estado: e };
}

function postarBlind(e: EstadoMutavel, i: number, valor: Fichas, qual: 'small' | 'big'): void {
  const j = e.jogadores[i] as JogadorMutavel;
  const pago = Math.min(valor, j.stack);
  j.stack -= pago;
  j.apostaNaRodada = pago;
  j.totalApostado = pago;
  if (j.stack === 0) j.situacao = 'all-in';
  e.eventos.push({ tipo: 'blind', jogadorId: j.id, qual, valor: pago });
}

/**
 * Leva a mão adiante até alguém precisar decidir: passa a vez, fecha rodadas, abre
 * flop/turn/river e, se ninguém mais pode apostar, revela as cartas que faltam e faz
 * o showdown.
 */
function avancar(e: EstadoMutavel, aPartirDe: number): void {
  for (;;) {
    const naMao = e.jogadores.filter((j) => j.situacao !== 'desistiu');
    if (naMao.length === 1) {
      encerrarSemShowdown(e, naMao[0] as JogadorMutavel);
      return;
    }

    const proximo = proximoAAgir(e, aPartirDe);
    if (proximo !== null) {
      e.vez = proximo;
      return;
    }

    e.vez = null;
    if (e.fase === 'river') {
      showdown(e);
      return;
    }
    abrirProximaRodada(e);
    aPartirDe = (e.botao + 1) % e.jogadores.length;
  }
}

/** Primeiro jogador, a partir de `aPartirDe`, que ainda precisa agir nesta rodada. */
function proximoAAgir(e: EstadoMutavel, aPartirDe: number): number | null {
  const comFichas = e.jogadores.filter((j) => j.situacao === 'ativo');
  if (comFichas.length === 0) return null;
  // Só um jogador pode apostar e já cobriu a aposta: não há contra quem apostar.
  if (comFichas.length === 1 && (comFichas[0] as JogadorMutavel).apostaNaRodada >= e.maiorAposta) {
    return null;
  }

  const n = e.jogadores.length;
  for (let k = 0; k < n; k++) {
    const i = (aPartirDe + k) % n;
    const j = e.jogadores[i] as JogadorMutavel;
    if (j.situacao === 'ativo' && (!j.jaAgiu || j.apostaNaRodada < e.maiorAposta)) return i;
  }
  return null;
}

const PROXIMA_FASE = { 'pre-flop': 'flop', flop: 'turn', turn: 'river' } as const;

function abrirProximaRodada(e: EstadoMutavel): void {
  if (e.fase !== 'pre-flop' && e.fase !== 'flop' && e.fase !== 'turn') {
    throw new Error(`Não há rodada depois de ${e.fase}.`);
  }
  const fase = PROXIMA_FASE[e.fase];
  const { cartas, restante } = distribuir(e.baralho, fase === 'flop' ? 3 : 1);
  e.baralho = restante;
  e.cartasNaMesa = [...e.cartasNaMesa, ...cartas];
  e.fase = fase;
  e.maiorAposta = 0;
  e.aumentoMinimo = e.config.bigBlind;
  for (const j of e.jogadores) {
    j.apostaNaRodada = 0;
    j.jaAgiu = false;
    j.apostaQuandoAgiu = 0;
  }
  e.eventos.push({ tipo: 'cartas', fase, cartas });
}

function encerrarSemShowdown(e: EstadoMutavel, vencedor: JogadorMutavel): void {
  const total = e.jogadores.reduce((soma, j) => soma + j.totalApostado, 0);
  vencedor.stack += total;
  e.eventos.push({ tipo: 'pote', valor: total, vencedores: [vencedor.id], descricao: null });
  e.resultado = {
    potes: [{ valor: total, elegiveis: [vencedor.id], vencedores: [vencedor.id], descricao: null }],
    ganhos: { [vencedor.id]: total },
    maosReveladas: {},
  };
  e.fase = 'encerrada';
  e.vez = null;
}

function showdown(e: EstadoMutavel): void {
  const naMao = e.jogadores.filter((j) => j.situacao !== 'desistiu');
  const avaliacoes = new Map<string, AvaliacaoDeMao>(
    naMao.map((j) => [j.id, avaliarMao([...j.cartas, ...e.cartasNaMesa])]),
  );
  const avaliacao = (id: string) => avaliacoes.get(id) as AvaliacaoDeMao;

  for (const j of naMao) {
    e.eventos.push({
      tipo: 'showdown',
      jogadorId: j.id,
      cartas: j.cartas,
      descricao: descreverMao(avaliacao(j.id)),
    });
  }

  const ganhos: Record<string, Fichas> = {};
  const potes: PoteResolvido[] = calcularPotes(e.jogadores).map((pote) => {
    const elegiveis = aPartirDoBotao(e, pote.elegiveis);
    const indices = vencedores(elegiveis.map(avaliacao));
    const ganhadores = indices.map((i) => elegiveis[i] as string);

    // Divide igualmente; a(s) ficha(s) que sobram vão para os primeiros à esquerda do botão.
    const parte = Math.floor(pote.valor / ganhadores.length);
    const sobra = pote.valor % ganhadores.length;
    ganhadores.forEach((id, k) => {
      ganhos[id] = (ganhos[id] ?? 0) + parte + (k < sobra ? 1 : 0);
    });

    const descricao =
      elegiveis.length > 1 ? descreverMao(avaliacao(ganhadores[0] as string)) : null;
    e.eventos.push({ tipo: 'pote', valor: pote.valor, vencedores: ganhadores, descricao });
    return { valor: pote.valor, elegiveis, vencedores: ganhadores, descricao };
  });

  for (const j of e.jogadores) j.stack += ganhos[j.id] ?? 0;

  e.resultado = {
    potes,
    ganhos,
    maosReveladas: Object.fromEntries(
      naMao.map((j) => [
        j.id,
        {
          cartas: j.cartas,
          melhores: avaliacao(j.id).cartas,
          descricao: descreverMao(avaliacao(j.id)),
        },
      ]),
    ),
  };
  e.fase = 'encerrada';
  e.vez = null;
}

/** Ordena ids pela posição na mesa, começando pelo primeiro à esquerda do botão. */
function aPartirDoBotao(e: EstadoMutavel, ids: readonly string[]): string[] {
  const n = e.jogadores.length;
  const distancia = (id: string) =>
    (e.jogadores.findIndex((j) => j.id === id) - e.botao - 1 + n) % n;
  return [...ids].sort((a, b) => distancia(a) - distancia(b));
}
