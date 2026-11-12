import { cartas, formatarCarta, formatarCartas, type Carta } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import {
  baralhoComCartasNoTopo,
  baralhoEmbaralhado,
  criarBaralho,
  distribuir,
  type Baralho,
} from './baralho.js';

const notacoes = (lista: readonly Carta[]) => lista.map(formatarCarta);
const ordenadas = (lista: readonly Carta[]) => notacoes(lista).sort();

describe('criarBaralho', () => {
  it('tem as 52 cartas, sem repetição', () => {
    const baralho = criarBaralho();
    expect(baralho).toHaveLength(52);
    expect(new Set(notacoes(baralho)).size).toBe(52);
  });
});

describe('baralhoEmbaralhado', () => {
  it('tem as mesmas 52 cartas do baralho original', () => {
    expect(ordenadas(baralhoEmbaralhado())).toEqual(ordenadas(criarBaralho()));
  });

  it('muda a ordem das cartas', () => {
    // A chance de sair na ordem original é 1 em 52! (cerca de 1 em 10^67).
    expect(notacoes(baralhoEmbaralhado())).not.toEqual(notacoes(criarBaralho()));
  });
});

describe('distribuir', () => {
  it('tira cartas do topo e devolve o restante', () => {
    const baralho = baralhoComCartasNoTopo(cartas('As Kd Qh'));
    const { cartas: tiradas, restante } = distribuir(baralho, 2);

    expect(formatarCartas(tiradas)).toBe('As Kd');
    expect(restante).toHaveLength(50);
    expect(formatarCarta(restante[0] as Carta)).toBe('Qh');
  });

  it('não altera o baralho original', () => {
    const baralho = criarBaralho();
    distribuir(baralho, 5);
    expect(baralho).toHaveLength(52);
  });

  it('distribui uma mão de 6 jogadores sem repetir cartas', () => {
    // 6 jogadores x 2 cartas + 5 cartas na mesa = 17 cartas.
    let baralho: Baralho = baralhoEmbaralhado();
    const saidas: Carta[] = [];
    for (const quantidade of [2, 2, 2, 2, 2, 2, 3, 1, 1]) {
      const resultado = distribuir(baralho, quantidade);
      saidas.push(...resultado.cartas);
      baralho = resultado.restante;
    }

    expect(new Set(notacoes(saidas)).size).toBe(17);
    expect(baralho).toHaveLength(35);
  });

  it('aceita tirar zero cartas e o baralho inteiro', () => {
    expect(distribuir(criarBaralho(), 0).cartas).toEqual([]);
    expect(distribuir(criarBaralho(), 52).restante).toEqual([]);
  });

  it.each([-1, 1.5, NaN])('rejeita quantidade %s', (quantidade) => {
    expect(() => distribuir(criarBaralho(), quantidade)).toThrow(/Quantidade inválida/);
  });

  it('rejeita pedir mais cartas do que restam', () => {
    expect(() => distribuir(criarBaralho(), 53)).toThrow(/Não há cartas suficientes/);
  });
});

describe('baralhoComCartasNoTopo', () => {
  it('coloca as cartas escolhidas no topo e completa as 52', () => {
    const baralho = baralhoComCartasNoTopo(cartas('As Ks Qs Js Ts'));

    expect(formatarCartas(baralho.slice(0, 5))).toBe('As Ks Qs Js Ts');
    expect(ordenadas(baralho)).toEqual(ordenadas(criarBaralho()));
  });

  it('rejeita cartas repetidas no topo', () => {
    const as = cartas('As');
    expect(() => baralhoComCartasNoTopo([...as, ...as])).toThrow(/Carta repetida no topo/);
  });
});
