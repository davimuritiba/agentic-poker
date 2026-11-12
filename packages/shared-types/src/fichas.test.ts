import { describe, expect, it } from 'vitest';
import { ehQuantidadeDeFichasValida } from './fichas.js';

describe('ehQuantidadeDeFichasValida', () => {
  it.each([0, 1, 1500, Number.MAX_SAFE_INTEGER])('aceita %s', (valor) => {
    expect(ehQuantidadeDeFichasValida(valor)).toBe(true);
  });

  it.each([-1, 0.5, 10.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejeita %s', (valor) => {
    expect(ehQuantidadeDeFichasValida(valor)).toBe(false);
  });
});
