import { cartas, formatarCartas } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { avaliarMao, compararMaos, vencedores, type CategoriaDeMao } from './avaliador.js';

const avaliar = (texto: string) => avaliarMao(cartas(texto));

/** Compara duas mãos escritas em notação curta: 1 se a primeira ganha, -1 se perde, 0 se empata. */
const comparar = (a: string, b: string) => Math.sign(compararMaos(avaliar(a), avaliar(b)));

describe('categorias', () => {
  it.each<[string, CategoriaDeMao, string]>([
    ['As Ks Qs Js Ts 2c 3d', 'straight-flush', 'As Ks Qs Js Ts'],
    ['5s 4s 3s 2s As Kd Kh', 'straight-flush', '5s 4s 3s 2s As'],
    ['Ac Ad Ah As 2c 3d 4h', 'quadra', 'Ac Ad Ah As 4h'],
    ['Ac Ad Ah Ks Kc 3d 4h', 'full-house', 'Ac Ad Ah Ks Kc'],
    ['2c 7c 9c Jc Kc 3d 4h', 'flush', 'Kc Jc 9c 7c 2c'],
    ['9c Td Jh Qs Kc 2d 2h', 'sequencia', 'Kc Qs Jh Td 9c'],
    ['Ac 2d 3h 4s 5c Kd 9h', 'sequencia', '5c 4s 3h 2d Ac'],
    ['Ac Ad Ah 2c 3d 7h 9s', 'trinca', 'Ac Ad Ah 9s 7h'],
    ['Ac Ad Kh Kc 3d 7h 9s', 'dois-pares', 'Ac Ad Kh Kc 9s'],
    ['Ac Ad 2h 5c 3d 7h 9s', 'par', 'Ac Ad 9s 7h 5c'],
    ['Ac Td 2h 5c 3d 7h 9s', 'carta-alta', 'Ac Td 9s 7h 5c'],
  ])('%s → %s', (mao, categoria, melhores) => {
    const avaliacao = avaliar(mao);
    expect(avaliacao.categoria).toBe(categoria);
    expect(formatarCartas(avaliacao.cartas)).toBe(melhores);
  });
});

describe('casos que costumam gerar bugs', () => {
  it('A-2-3-4-5 é a sequência mais baixa: perde para 2-3-4-5-6', () => {
    expect(avaliar('Ac 2d 3h 4s 5c Kd 9h').desempate).toEqual([5]);
    expect(comparar('Ac 2d 3h 4s 5c', '6c 2d 3h 4s 5c')).toBe(-1);
  });

  it('o Ás não "dá a volta": Q-K-A-2-3 não é sequência', () => {
    expect(avaliar('Qc Kd Ah 2s 3c').categoria).toBe('carta-alta');
  });

  it('com 6 cartas em sequência, vale a mais alta', () => {
    expect(formatarCartas(avaliar('4c 5d 6h 7s 8c 9d 2h').cartas)).toBe('9d 8c 7s 6h 5d');
  });

  it('par no meio da sequência não atrapalha', () => {
    expect(avaliar('Ac Kd Qh Js Tc Td 2h').categoria).toBe('sequencia');
  });

  it('flush com 6 ou 7 cartas do naipe usa as 5 mais altas', () => {
    expect(formatarCartas(avaliar('2s 4s 6s 8s Ts Qs Ks').cartas)).toBe('Ks Qs Ts 8s 6s');
  });

  it('flush e sequência ao mesmo tempo, mas não straight flush: vale o flush', () => {
    // Sequência 5-9 misturada, flush de copas sem sequência.
    expect(avaliar('5h 6h 7c 8h 9d Kh 2h').categoria).toBe('flush');
  });

  it('straight flush mais alto entre 6 cartas do mesmo naipe', () => {
    expect(formatarCartas(avaliar('5h 6h 7h 8h 9h Th 2c').cartas)).toBe('Th 9h 8h 7h 6h');
  });

  it('duas trincas viram full house com a trinca maior', () => {
    const mao = avaliar('Ac Ad Ah Kc Kd Kh 2s');
    expect(mao.categoria).toBe('full-house');
    expect(mao.desempate).toEqual([14, 13]);
  });

  it('trinca e dois pares: full house usa o par mais alto', () => {
    expect(avaliar('7c 7d 7h Kc Kd 2s 2h').desempate).toEqual([7, 13]);
  });

  it('quadra usa a maior carta restante como kicker, mesmo vinda de um par ou trinca', () => {
    expect(avaliar('9c 9d 9h 9s Kc Kd 2h').desempate).toEqual([9, 13]);
    expect(avaliar('9c 9d 9h 9s 2c 2d 2h').desempate).toEqual([9, 2]);
  });

  it('três pares: fica com os dois maiores, e o kicker pode vir do terceiro par', () => {
    const mao = avaliar('Kc Kd Qh Qs Jc Jd 2h');
    expect(mao.categoria).toBe('dois-pares');
    expect(mao.desempate).toEqual([13, 12, 11]);
  });

  it('mesmos dois pares: decide o kicker', () => {
    expect(comparar('Kc Kd 7h 7s Ac', 'Kh Ks 7c 7d Qc')).toBe(1);
  });

  it('mesmo par: decidem os kickers, um a um', () => {
    expect(comparar('Ac Ad Kh 9s 3c', 'Ah As Kc 9d 2c')).toBe(1);
  });

  it('carta alta: compara as 5 cartas, até a última', () => {
    expect(comparar('Ac Jd 9h 6s 4c', 'Ah Jc 9d 6h 3c')).toBe(1);
  });

  it('naipe nunca desempata', () => {
    expect(comparar('As Ks Qs Js 9s', 'Ah Kh Qh Jh 9h')).toBe(0);
    expect(comparar('Ac Ad Kh 9s 3c', 'Ah As Kc 9d 3d')).toBe(0);
  });

  it('a sexta e a sétima cartas não contam para o desempate', () => {
    // Mesa: Ac Kd Qh Js 9c. Os dois jogadores usam a mesa inteira (a "mesa joga").
    expect(comparar('Ac Kd Qh Js 9c 2s 3s', 'Ac Kd Qh Js 9c 4h 5h')).toBe(0);
  });
});

describe('ordem entre categorias', () => {
  it('cada categoria ganha da anterior', () => {
    const exemplos = [
      'Ac Td 2h 5c 3d 7h 9s',
      'Ac Ad 2h 5c 3d 7h 9s',
      'Ac Ad Kh Kc 3d 7h 9s',
      'Ac Ad Ah 2c 3d 7h 9s',
      'Ac 2d 3h 4s 5c Kd 9h',
      '2c 7c 9c Jc Kc 3d 4h',
      '2c 2d 2h 3s 3c 9d Th',
      '2c 2d 2h 2s 3c 4d 5h',
      '5s 4s 3s 2s As Kd Kh',
    ];
    for (let i = 1; i < exemplos.length; i++) {
      expect(comparar(exemplos[i] as string, exemplos[i - 1] as string)).toBe(1);
    }
  });
});

describe('vencedores', () => {
  it('devolve o índice da mão mais forte', () => {
    const maos = ['Ac Ad 2h 5c 3d', 'Kc Kd Kh 5s 3c', 'Qc Jd 2c 5d 3h'].map(avaliar);
    expect(vencedores(maos)).toEqual([1]);
  });

  it('devolve todos os índices empatados (pote dividido)', () => {
    const maos = ['As Ks Qs Js 9s', '2c 3d 4h 6s 8c', 'Ah Kh Qh Jh 9h'].map(avaliar);
    expect(vencedores(maos)).toEqual([0, 2]);
  });

  it('lista vazia não tem vencedores', () => {
    expect(vencedores([])).toEqual([]);
  });
});

describe('entradas inválidas', () => {
  it.each(['As Ks Qs Js', 'As Ks Qs Js Ts 9s 8s 7s'])('rejeita "%s"', (mao) => {
    expect(() => avaliar(mao)).toThrow(/5 a 7 cartas/);
  });

  it('rejeita carta repetida', () => {
    const [as] = cartas('As');
    expect(() => avaliarMao([...cartas('Ks Qs Js Ts'), as!, as!])).toThrow(/Carta repetida/);
  });
});
