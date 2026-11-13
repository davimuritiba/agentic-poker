/**
 * Propriedades testadas em milhares de situações aleatórias: a lista de ações
 * permitidas e o validador sempre concordam, e todo efeito válido respeita as
 * regras de fichas.
 */
import type { Acao } from '@poker/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { acoesPermitidas } from './permitidas.js';
import type { SituacaoDeAposta } from './situacao.js';
import { validarAcao } from './validador.js';

const qualquerSituacao: fc.Arbitrary<SituacaoDeAposta> = fc
  .record({
    stack: fc.oneof(fc.integer({ min: 0, max: 2000 }), fc.constantFrom(0, 1, 100)),
    maiorAposta: fc.oneof(fc.integer({ min: 0, max: 2000 }), fc.constant(0)),
    fracaoJaApostada: fc.double({ min: 0, max: 1, noNaN: true }),
    aumentoMinimo: fc.integer({ min: 1, max: 500 }),
    podeAumentar: fc.boolean(),
  })
  .map(({ fracaoJaApostada, ...s }) => ({
    ...s,
    apostaDoJogador: Math.floor(s.maiorAposta * fracaoJaApostada),
  }));

const qualquerAcao: fc.Arbitrary<Acao> = fc.oneof(
  fc.constant({ tipo: 'desistir' } as const),
  fc.constant({ tipo: 'passar' } as const),
  fc.constant({ tipo: 'pagar' } as const),
  fc.constant({ tipo: 'all-in' } as const),
  fc.integer({ min: 0, max: 4000 }).map((valor) => ({ tipo: 'apostar', valor }) as const),
  fc.integer({ min: 0, max: 4000 }).map((valor) => ({ tipo: 'aumentar', valor }) as const),
);

const ehValida = (s: SituacaoDeAposta, acao: Acao) => validarAcao(s, acao).valida;

describe('acoesPermitidas e validarAcao concordam', () => {
  it('toda ação listada como permitida é válida', () => {
    fc.assert(
      fc.property(qualquerSituacao, (s) => {
        const p = acoesPermitidas(s);
        expect(ehValida(s, { tipo: 'desistir' })).toBe(p.desistir);
        expect(ehValida(s, { tipo: 'passar' })).toBe(p.passar);
        expect(ehValida(s, { tipo: 'pagar' })).toBe(p.pagar !== undefined);
        expect(ehValida(s, { tipo: 'all-in' })).toBe(p.allIn !== undefined);

        for (const tipo of ['apostar', 'aumentar'] as const) {
          const intervalo = p[tipo];
          if (!intervalo) continue;
          expect(ehValida(s, { tipo, valor: intervalo.minimo })).toBe(true);
          expect(ehValida(s, { tipo, valor: intervalo.maximo })).toBe(true);
          expect(ehValida(s, { tipo, valor: intervalo.minimo - 1 })).toBe(false);
          expect(ehValida(s, { tipo, valor: intervalo.maximo + 1 })).toBe(false);
        }
      }),
      { numRuns: 5_000 },
    );
  });

  it('apostar/aumentar só valem dentro do intervalo permitido', () => {
    fc.assert(
      fc.property(qualquerSituacao, qualquerAcao, (s, acao) => {
        if (acao.tipo !== 'apostar' && acao.tipo !== 'aumentar') return;
        const intervalo = acoesPermitidas(s)[acao.tipo];
        const dentro =
          intervalo !== undefined &&
          acao.valor >= intervalo.minimo &&
          acao.valor <= intervalo.maximo;
        expect(ehValida(s, acao)).toBe(dentro);
      }),
      { numRuns: 5_000 },
    );
  });
});

describe('todo efeito válido respeita as regras de fichas', () => {
  it('em qualquer situação e ação', () => {
    fc.assert(
      fc.property(qualquerSituacao, qualquerAcao, (s, acao) => {
        const resultado = validarAcao(s, acao);
        if (!resultado.valida) return;
        const e = resultado.efeito;

        // Nunca coloca fichas negativas nem mais do que o jogador tem.
        expect(e.fichasColocadas).toBeGreaterThanOrEqual(0);
        expect(e.fichasColocadas).toBeLessThanOrEqual(s.stack);
        expect(e.apostaTotal).toBe(s.apostaDoJogador + e.fichasColocadas);

        // A maior aposta nunca diminui.
        expect(e.novaMaiorAposta).toBe(Math.max(s.maiorAposta, e.apostaTotal));

        // Só aumento completo reabre a ação e muda o aumento mínimo.
        const aumento = e.novaMaiorAposta - s.maiorAposta;
        if (e.reabreAcao) {
          expect(aumento).toBeGreaterThanOrEqual(s.aumentoMinimo);
          expect(e.novoAumentoMinimo).toBe(aumento);
        } else {
          expect(e.novoAumentoMinimo).toBe(s.aumentoMinimo);
        }

        // All-in é exatamente "colocou todas as fichas".
        const colocouTudo = e.fichasColocadas === s.stack && e.fichasColocadas > 0;
        expect(e.allIn).toBe(colocouTudo && e.tipo !== 'desistir');

        // Quem paga ou passa não sobe a aposta.
        if (e.tipo === 'pagar' || e.tipo === 'passar' || e.tipo === 'desistir') {
          expect(e.novaMaiorAposta).toBe(s.maiorAposta);
        }
      }),
      { numRuns: 10_000 },
    );
  });
});
