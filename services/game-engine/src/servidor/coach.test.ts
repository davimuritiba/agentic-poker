import { describe, expect, it } from 'vitest';
import { LimiteDoCoach } from './coach.js';

describe('LimiteDoCoach', () => {
  it('um pedido por vez, por jogador', () => {
    const limite = new LimiteDoCoach();
    expect(limite.tentarComecar('a', 10_000)).toBeNull();
    expect(limite.tentarComecar('a', 20_000)).toMatch(/ainda está analisando/);
    expect(limite.tentarComecar('b', 10_000)).toBeNull(); // outro jogador não espera
  });

  it('exige um intervalo mínimo entre pedidos', () => {
    const limite = new LimiteDoCoach();
    limite.tentarComecar('a', 10_000);
    limite.terminar('a');
    expect(limite.tentarComecar('a', 10_500)).toMatch(/Aguarde/);
    expect(limite.tentarComecar('a', 12_000)).toBeNull();
  });
});
