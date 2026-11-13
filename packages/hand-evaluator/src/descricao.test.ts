import { cartas } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { avaliarMao } from './avaliador.js';
import { descreverMao } from './descricao.js';

describe('descreverMao', () => {
  it.each([
    ['Ac Td 2h 5c 3d 7h 9s', 'Carta alta: Ás'],
    ['Kc Kd 2h 5c 3d 7h 9s', 'Par de Reis'],
    ['Ac Ad 7h 7c 3d Jh 9s', 'Dois pares: Ases e 7'],
    ['9c 9d 9h 2c 3d 7h Js', 'Trinca de 9'],
    ['Ac 2d 3h 4s 5c Kd 9h', 'Sequência até 5'],
    ['2c 7c 9c Jc Qc 3d 4h', 'Flush com Dama'],
    ['Kc Kd Kh 7s 7c 3d 4h', 'Full house: Reis com 7'],
    ['Jc Jd Jh Js 2c 3d 4h', 'Quadra de Valetes'],
    ['As Ks Qs Js Ts 2c 3d', 'Royal flush'],
    ['5h 6h 7h 8h 9h 2c 3d', 'Straight flush até 9'],
  ])('%s → %s', (mao, esperado) => {
    expect(descreverMao(avaliarMao(cartas(mao)))).toBe(esperado);
  });
});
