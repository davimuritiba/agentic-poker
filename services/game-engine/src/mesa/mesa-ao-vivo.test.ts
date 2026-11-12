import type { VisaoDaMesa } from '@poker/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MesaAoVivo } from './mesa-ao-vivo.js';

const STACK = 1000;

function novaMesa() {
  return new MesaAoVivo({
    id: 'teste',
    nome: 'Mesa de teste',
    smallBlind: 5,
    bigBlind: 10,
    stackInicial: STACK,
    tempoDaVezMs: 1_000,
    pausaEntreMaosMs: 500,
    atrasoDoBotMs: 10,
  });
}

/** Fichas de todos somadas: fora da mesa + apostas da rodada + pote. */
const fichasNaMesa = (v: VisaoDaMesa) =>
  v.jogadores.reduce((soma, j) => soma + j.stack + j.apostaNaRodada, 0) + v.pote;

let mesa: MesaAoVivo;
beforeEach(() => {
  vi.useFakeTimers();
  mesa = novaMesa();
});
afterEach(() => {
  mesa.encerrar();
  vi.useRealTimers();
});

describe('MesaAoVivo', () => {
  it('não começa só com bots', () => {
    mesa.adicionarBot();
    mesa.adicionarBot();
    expect(mesa.visao(null).fase).toBe('aguardando');
  });

  it('começa quando há um humano e mais alguém', () => {
    mesa.sentar('humano', 'Davi');
    expect(mesa.visao('humano').fase).toBe('aguardando');
    mesa.adicionarBot();
    const v = mesa.visao('humano');
    expect(v.fase).toBe('pre-flop');
    expect(v.numeroDaMao).toBe(1);
    expect(v.jogadores.find((j) => j.ehBot)?.nome).toBe('Ada (bot)');
  });

  it('cada um vê só as próprias cartas', () => {
    mesa.sentar('humano', 'Davi');
    mesa.adicionarBot();

    const doHumano = mesa.visao('humano');
    const humano = doHumano.jogadores.find((j) => j.id === 'humano');
    const bot = doHumano.jogadores.find((j) => j.ehBot);
    expect(humano?.cartas).toHaveLength(2);
    expect(bot?.cartas).toBeNull();
    expect(bot?.quantidadeDeCartas).toBe(2);

    const deEspectador = mesa.visao(null);
    expect(deEspectador.jogadores.every((j) => j.cartas === null)).toBe(true);
    expect(JSON.stringify(deEspectador)).not.toContain('baralho');
  });

  it('só quem tem a vez recebe as ações permitidas', () => {
    mesa.sentar('humano', 'Davi');
    mesa.sentar('outra', 'Bia');
    const v = mesa.visao('humano');
    const daVez = v.vezDe as string;
    const outro = daVez === 'humano' ? 'outra' : 'humano';
    expect(mesa.visao(daVez).voce?.acoes).not.toBeNull();
    expect(mesa.visao(outro).voce?.acoes).toBeNull();
    expect(mesa.agir(outro, { tipo: 'pagar' })).toEqual({ ok: false, motivo: 'Não é a sua vez.' });
  });

  it('joga muitas mãos seguidas com bots, sem criar nem perder fichas', () => {
    mesa.sentar('humano', 'Davi');
    mesa.adicionarBot();
    mesa.adicionarBot();
    mesa.adicionarBot();
    const total = 4 * STACK;

    // O humano nunca joga: o tempo esgota e ele passa ou desiste. Quem fica sem fichas
    // sai da mesa sem levar nada, então o total na mesa nunca muda.
    for (let passo = 0; passo < 400; passo++) {
      vi.advanceTimersByTime(250);
      expect(fichasNaMesa(mesa.visao('humano'))).toBe(total);
    }
    expect(mesa.visao('humano').numeroDaMao).toBeGreaterThan(5);
  });

  it('tempo esgotado: passa se puder, senão desiste', () => {
    mesa.sentar('a', 'Ana');
    mesa.sentar('b', 'Bia');
    // Heads-up: o small blind age primeiro e tem 5 a pagar, então não pode passar.
    const daVez = mesa.visao(null).vezDe as string;
    vi.advanceTimersByTime(1_000);
    expect(mesa.visao(null).eventos).toContainEqual(
      expect.objectContaining({ tipo: 'acao', jogadorId: daVez, acao: 'desistir' }),
    );
  });

  it('quem sai no meio da mão desiste e deixa o assento no fim dela', () => {
    mesa.sentar('a', 'Ana');
    mesa.sentar('b', 'Bia');
    mesa.sentar('c', 'Caio');
    const v = mesa.visao(null);
    const naoDaVez = v.jogadores.find((j) => j.id !== v.vezDe)?.id as string;

    mesa.levantar(naoDaVez);
    expect(mesa.estaSentado(naoDaVez)).toBe(true);

    vi.advanceTimersByTime(10_000);
    expect(mesa.estaSentado(naoDaVez)).toBe(false);
  });

  it('jogador desconectado que perde o tempo sai da mesa no fim da mão', () => {
    mesa.sentar('a', 'Ana');
    mesa.sentar('b', 'Bia');
    const daVez = mesa.visao(null).vezDe as string;
    mesa.definirConexao(daVez, false);
    vi.advanceTimersByTime(1_000); // tempo esgotado
    vi.advanceTimersByTime(10_000);
    expect(mesa.estaSentado(daVez)).toBe(false);
  });
});
