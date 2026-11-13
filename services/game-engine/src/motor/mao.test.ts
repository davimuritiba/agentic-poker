import { baralhoComCartasNoTopo } from '@poker/deck';
import { cartas, formatarCartas, type Acao } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { acoesDaVez, aplicarAcao, iniciarMao } from './mao.js';
import { calcularPotes } from './potes.js';
import type { EstadoDaMao, JogadorNaMao } from './tipos.js';

/**
 * Monta uma mão com blinds 5/10. Os jogadores sentam nos assentos 0, 1, 2... na ordem
 * dada. `topo` define as cartas: 2 para cada jogador a partir da esquerda do botão,
 * depois flop (3), turn e river.
 */
function novaMao(
  jogadores: [id: string, stack: number][],
  opcoes: { botao?: number; topo?: string } = {},
): EstadoDaMao {
  return iniciarMao({
    config: { smallBlind: 5, bigBlind: 10 },
    jogadores: jogadores.map(([id, stack], assento) => ({ id, stack, assento })),
    assentoDoBotao: opcoes.botao ?? 0,
    baralho: opcoes.topo ? baralhoComCartasNoTopo(cartas(opcoes.topo)) : undefined,
  });
}

/** Aplica uma sequência de ações e falha se alguma for recusada. */
function jogar(estado: EstadoDaMao, ...jogadas: [id: string, acao: Acao][]): EstadoDaMao {
  return jogadas.reduce((e, [id, acao]) => {
    const r = aplicarAcao(e, id, acao);
    if (!r.ok) throw new Error(`${id} ${acao.tipo}: ${r.motivo}`);
    return r.estado;
  }, estado);
}

const PAGAR: Acao = { tipo: 'pagar' };
const PASSAR: Acao = { tipo: 'passar' };
const DESISTIR: Acao = { tipo: 'desistir' };
const ALL_IN: Acao = { tipo: 'all-in' };
const aumentar = (valor: number): Acao => ({ tipo: 'aumentar', valor });
const apostar = (valor: number): Acao => ({ tipo: 'apostar', valor });

const jogador = (e: EstadoDaMao, id: string) =>
  e.jogadores.find((j) => j.id === id) as JogadorNaMao;
const daVez = (e: EstadoDaMao) => (e.vez === null ? null : e.jogadores[e.vez]?.id);
const stacks = (e: EstadoDaMao) => Object.fromEntries(e.jogadores.map((j) => [j.id, j.stack]));

describe('início da mão', () => {
  it('heads-up: o botão posta o small blind e age primeiro', () => {
    const e = novaMao([
      ['ana', 1000],
      ['bia', 1000],
    ]);
    expect(jogador(e, 'ana').apostaNaRodada).toBe(5);
    expect(jogador(e, 'bia').apostaNaRodada).toBe(10);
    expect(daVez(e)).toBe('ana');
    expect(acoesDaVez(e)?.pagar).toBe(5);
  });

  it('3 jogadores: blinds à esquerda do botão, e o botão age primeiro', () => {
    const e = novaMao([
      ['btn', 1000],
      ['sb', 1000],
      ['bb', 1000],
    ]);
    expect(jogador(e, 'sb').apostaNaRodada).toBe(5);
    expect(jogador(e, 'bb').apostaNaRodada).toBe(10);
    expect(daVez(e)).toBe('btn');
  });

  it('distribui 2 cartas para cada um a partir da esquerda do botão', () => {
    const e = novaMao(
      [
        ['btn', 1000],
        ['sb', 1000],
        ['bb', 1000],
      ],
      { topo: 'As Ad Kh Kd Qc Qd' },
    );
    expect(formatarCartas(jogador(e, 'sb').cartas)).toBe('As Ad');
    expect(formatarCartas(jogador(e, 'bb').cartas)).toBe('Kh Kd');
    expect(formatarCartas(jogador(e, 'btn').cartas)).toBe('Qc Qd');
    expect(e.baralho).toHaveLength(52 - 6);
  });

  it.each<[string, () => EstadoDaMao, RegExp]>([
    ['um jogador só', () => novaMao([['ana', 100]]), /pelo menos 2/],
    [
      'stack zerado',
      () =>
        novaMao([
          ['ana', 100],
          ['bia', 0],
        ]),
      /sem fichas/,
    ],
    [
      'botão em assento vazio',
      () =>
        novaMao(
          [
            ['ana', 100],
            ['bia', 100],
          ],
          { botao: 7 },
        ),
      /assento do botão/,
    ],
  ])('rejeita %s', (_nome, criar, erro) => {
    expect(criar).toThrow(erro);
  });
});

describe('rodadas de apostas', () => {
  it('todos desistem: o big blind leva os blinds, sem mostrar cartas', () => {
    let e = novaMao([
      ['btn', 1000],
      ['sb', 1000],
      ['bb', 1000],
    ]);
    e = jogar(e, ['btn', DESISTIR], ['sb', DESISTIR]);

    expect(e.fase).toBe('encerrada');
    expect(stacks(e)).toEqual({ btn: 1000, sb: 995, bb: 1005 });
    expect(e.resultado?.maosReveladas).toEqual({});
  });

  it('big blind tem a opção de aumentar quando todos só pagam', () => {
    let e = novaMao([
      ['btn', 1000],
      ['sb', 1000],
      ['bb', 1000],
    ]);
    e = jogar(e, ['btn', PAGAR], ['sb', PAGAR]);

    expect(daVez(e)).toBe('bb');
    expect(acoesDaVez(e)).toMatchObject({ passar: true, aumentar: { minimo: 20 } });

    e = jogar(e, ['bb', PASSAR]);
    expect(e.fase).toBe('flop');
    expect(e.cartasNaMesa).toHaveLength(3);
    expect(daVez(e)).toBe('sb'); // depois do flop, começa quem está à esquerda do botão
  });

  it('aumento reabre a ação para quem já tinha agido', () => {
    let e = novaMao([
      ['btn', 1000],
      ['sb', 1000],
      ['bb', 1000],
    ]);
    e = jogar(e, ['btn', PAGAR], ['sb', PAGAR], ['bb', aumentar(40)]);
    expect(daVez(e)).toBe('btn');
    expect(acoesDaVez(e)?.aumentar?.minimo).toBe(70); // 40 + último aumento (30)
  });

  it('all-in menor que um aumento completo não reabre a ação', () => {
    let e = novaMao([
      ['x', 1000],
      ['y', 1000],
      ['z', 150],
    ]);
    // x aumenta para 100 (aumento de 90); y paga; z vai all-in com 150 (só +50).
    e = jogar(e, ['x', aumentar(100)], ['y', PAGAR], ['z', ALL_IN]);

    expect(daVez(e)).toBe('x');
    const acoes = acoesDaVez(e);
    expect(acoes?.pagar).toBe(50);
    expect(acoes?.aumentar).toBeUndefined();
    expect(aplicarAcao(e, 'x', aumentar(400))).toMatchObject({ ok: false });
  });

  it('dois all-ins menores que, somados, formam um aumento completo reabrem a ação', () => {
    let e = novaMao(
      [
        ['z1', 150],
        ['z2', 200],
        ['y', 1000],
        ['x', 1000],
      ],
      { botao: 0 },
    );
    // x (primeiro a agir) aumenta para 100; z1 all-in 150 (+50); z2 all-in 200 (+50); y desiste.
    e = jogar(e, ['x', aumentar(100)], ['z1', ALL_IN], ['z2', ALL_IN], ['y', DESISTIR]);

    expect(daVez(e)).toBe('x');
    expect(acoesDaVez(e)?.aumentar).toBeDefined(); // enfrenta +100, mais que o aumento de 90
  });

  it('jogada fora da vez ou depois do fim é recusada', () => {
    let e = novaMao([
      ['ana', 1000],
      ['bia', 1000],
    ]);
    expect(aplicarAcao(e, 'bia', PAGAR)).toEqual({ ok: false, motivo: 'Não é a sua vez.' });
    expect(aplicarAcao(e, 'ana', PASSAR)).toMatchObject({
      ok: false,
      motivo: /Não dá para passar/,
    });
    expect(aplicarAcao(e, 'ana', { tipo: 'trapacear' } as unknown as Acao)).toMatchObject({
      ok: false,
      motivo: /Ação desconhecida/,
    });

    e = jogar(e, ['ana', DESISTIR]);
    expect(aplicarAcao(e, 'bia', PASSAR)).toEqual({ ok: false, motivo: 'A mão já terminou.' });
  });

  it('não altera o estado anterior', () => {
    const antes = novaMao([
      ['ana', 1000],
      ['bia', 1000],
    ]);
    const copia = structuredClone(antes);
    jogar(antes, ['ana', aumentar(30)]);
    expect(antes).toEqual(copia);
  });
});

describe('showdown', () => {
  it('mão completa até o river: melhor mão leva o pote', () => {
    // ana: As Ah | bia: Kc Kd | mesa: 2c 7d 9h Js 3c
    let e = novaMao(
      [
        ['bia', 1000],
        ['ana', 1000],
      ],
      { botao: 0, topo: 'As Ah Kc Kd 2c 7d 9h Js 3c' },
    );
    e = jogar(e, ['bia', PAGAR], ['ana', PASSAR]); // pré-flop
    e = jogar(e, ['ana', apostar(20)], ['bia', PAGAR]); // flop
    e = jogar(e, ['ana', PASSAR], ['bia', PASSAR]); // turn
    e = jogar(e, ['ana', PASSAR], ['bia', PASSAR]); // river

    expect(e.fase).toBe('encerrada');
    expect(formatarCartas(e.cartasNaMesa)).toBe('2c 7d 9h Js 3c');
    expect(stacks(e)).toEqual({ bia: 970, ana: 1030 });
    expect(e.resultado?.maosReveladas.ana?.descricao).toBe('Par de Ases');
    expect(e.resultado?.potes).toEqual([
      { valor: 60, elegiveis: ['ana', 'bia'], vencedores: ['ana'], descricao: 'Par de Ases' },
    ]);
  });

  it('all-in com mais jogadores: pote principal e side pot vão para vencedores diferentes', () => {
    // botão = c. Cartas a partir da esquerda do botão: a, b, c.
    // a (100): As Ad | b (300): Ks Kd | c (300): Qs Qd | mesa sem ajudar ninguém.
    let e = novaMao(
      [
        ['c', 300],
        ['a', 100],
        ['b', 300],
      ],
      { botao: 0, topo: 'As Ad Ks Kd Qs Qd 2c 7h 9d 3s 4h' },
    );
    e = jogar(e, ['c', ALL_IN], ['a', ALL_IN], ['b', ALL_IN]);

    expect(e.fase).toBe('encerrada');
    expect(e.cartasNaMesa).toHaveLength(5); // cartas reveladas sem mais apostas
    expect(e.resultado?.potes).toEqual([
      { valor: 300, elegiveis: ['a', 'b', 'c'], vencedores: ['a'], descricao: 'Par de Ases' },
      { valor: 400, elegiveis: ['b', 'c'], vencedores: ['b'], descricao: 'Par de Reis' },
    ]);
    expect(stacks(e)).toEqual({ c: 0, a: 300, b: 400 });
  });

  it('empate divide o pote, e a ficha ímpar vai para o primeiro à esquerda do botão', () => {
    // botão = c, sb = a, bb = b. Mesa com royal flush: todos empatam.
    let e = novaMao(
      [
        ['c', 1000],
        ['a', 1000],
        ['b', 1000],
      ],
      { botao: 0, topo: '2c 3d 4h 5c 6d 7h As Ks Qs Js Ts' },
    );
    e = jogar(e, ['c', PAGAR], ['a', DESISTIR], ['b', PASSAR]); // pote = 5 + 10 + 10 = 25
    for (let rodada = 0; rodada < 3; rodada++) e = jogar(e, ['b', PASSAR], ['c', PASSAR]);

    expect(e.resultado?.potes[0]).toMatchObject({ valor: 25, vencedores: ['b', 'c'] });
    expect(e.resultado?.ganhos).toEqual({ b: 13, c: 12 });
    expect(stacks(e)).toEqual({ c: 1002, a: 995, b: 1003 });
  });

  it('big blind all-in com menos que o blind: o excedente volta para quem pagou', () => {
    // bia (botão/sb) pagou 10; ana só tinha 4 no big blind.
    let e = novaMao(
      [
        ['bia', 1000],
        ['ana', 4],
      ],
      { botao: 0, topo: 'As Ad Kc Kd 2c 7d 9h Js 3c' },
    );
    e = jogar(e, ['bia', PAGAR]);

    expect(e.fase).toBe('encerrada');
    expect(e.resultado?.potes).toEqual([
      { valor: 8, elegiveis: ['ana', 'bia'], vencedores: ['ana'], descricao: 'Par de Ases' },
      { valor: 6, elegiveis: ['bia'], vencedores: ['bia'], descricao: null },
    ]);
    expect(stacks(e)).toEqual({ bia: 996, ana: 8 });
  });
});

describe('calcularPotes', () => {
  const j = (id: string, totalApostado: number, situacao: JogadorNaMao['situacao'] = 'all-in') =>
    ({ id, totalApostado, situacao }) as JogadorNaMao;

  it('exemplo clássico com dois all-ins', () => {
    expect(calcularPotes([j('a', 100), j('b', 300), j('c', 300, 'ativo')])).toEqual([
      { valor: 300, elegiveis: ['a', 'b', 'c'] },
      { valor: 400, elegiveis: ['b', 'c'] },
    ]);
  });

  it('fichas de quem desistiu entram no pote, mas a pessoa não concorre', () => {
    expect(calcularPotes([j('a', 50, 'desistiu'), j('b', 200), j('c', 200, 'ativo')])).toEqual([
      { valor: 450, elegiveis: ['b', 'c'] },
    ]);
  });
});
