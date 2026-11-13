/**
 * Milhares de mãos aleatórias jogadas até o fim, com jogadas legais sorteadas.
 * Funciona como o "agente de playtest" do documento, em miniatura: procura qualquer
 * sequência de jogadas que quebre uma regra básica do motor.
 */
import { baralhoEmbaralhado, embaralhar, type Sorteador } from '@poker/deck';
import type { Acao, AcoesPermitidas } from '@poker/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { acoesDaVez, aplicarAcao, iniciarMao } from './mao.js';
import type { EstadoDaMao } from './tipos.js';

/** Sorteia uma jogada legal. `r` devolve números em [0, 1). */
function jogadaAleatoria(acoes: AcoesPermitidas, r: () => number): Acao {
  const opcoes: Acao[] = [];
  if (acoes.passar) opcoes.push({ tipo: 'passar' }, { tipo: 'passar' });
  if (acoes.pagar !== undefined) opcoes.push({ tipo: 'pagar' }, { tipo: 'pagar' });
  for (const tipo of ['apostar', 'aumentar'] as const) {
    const intervalo = acoes[tipo];
    if (intervalo) {
      const valor = intervalo.minimo + Math.floor(r() * (intervalo.maximo - intervalo.minimo + 1));
      opcoes.push({ tipo, valor });
    }
  }
  if (acoes.allIn !== undefined && r() < 0.15) opcoes.push({ tipo: 'all-in' });
  if (r() < 0.2) opcoes.push({ tipo: 'desistir' });
  if (opcoes.length === 0) opcoes.push({ tipo: 'desistir' });
  return opcoes[Math.floor(r() * opcoes.length)] as Acao;
}

const cenario = fc.record({
  stacks: fc.array(fc.integer({ min: 1, max: 600 }), { minLength: 2, maxLength: 6 }),
  botao: fc.nat(),
  sorteios: fc.array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), {
    minLength: 50,
    maxLength: 50,
  }),
});

describe('mãos aleatórias até o fim', () => {
  it('terminam, conservam as fichas e respeitam as regras básicas', () => {
    fc.assert(
      fc.property(cenario, ({ stacks, botao, sorteios }) => {
        let k = 0;
        const r = () => sorteios[k++ % sorteios.length] as number;
        const sortear: Sorteador = (limite) => Math.floor(r() * limite);

        let e: EstadoDaMao = iniciarMao({
          config: { smallBlind: 5, bigBlind: 10 },
          jogadores: stacks.map((stack, assento) => ({ id: `j${assento}`, assento, stack })),
          assentoDoBotao: botao % stacks.length,
          baralho: embaralhar(baralhoEmbaralhado(), sortear),
        });
        const totalInicial = stacks.reduce((a, b) => a + b, 0);

        for (let passos = 0; e.fase !== 'encerrada'; passos++) {
          expect(passos).toBeLessThan(500);
          const acoes = acoesDaVez(e);
          expect(acoes).not.toBeNull();
          const quem = e.jogadores[e.vez as number]?.id as string;
          const r2 = aplicarAcao(e, quem, jogadaAleatoria(acoes as AcoesPermitidas, r));
          expect(r2.ok).toBe(true);
          if (r2.ok) e = r2.estado;

          // Durante a mão: fichas fora + fichas apostadas = total inicial.
          const emJogo = e.jogadores.reduce(
            (soma, j) => soma + j.stack + (e.fase === 'encerrada' ? 0 : j.totalApostado),
            0,
          );
          expect(emJogo).toBe(totalInicial);
          for (const j of e.jogadores) expect(j.stack).toBeGreaterThanOrEqual(0);
        }

        const resultado = e.resultado;
        expect(resultado).not.toBeNull();
        if (!resultado) return;

        const apostado = e.jogadores.reduce((soma, j) => soma + j.totalApostado, 0);
        const distribuido = Object.values(resultado.ganhos).reduce((a, b) => a + b, 0);
        expect(distribuido).toBe(apostado);

        const naMao = new Set(
          e.jogadores.filter((j) => j.situacao !== 'desistiu').map((j) => j.id),
        );
        for (const pote of resultado.potes) {
          expect(pote.vencedores.length).toBeGreaterThan(0);
          for (const id of pote.vencedores) {
            expect(pote.elegiveis).toContain(id);
            expect(naMao.has(id)).toBe(true); // quem desistiu nunca ganha
          }
        }
        if (Object.keys(resultado.maosReveladas).length > 0) {
          expect(e.cartasNaMesa).toHaveLength(5);
        }

        // Nenhuma carta aparece duas vezes entre jogadores, mesa e baralho.
        const todas = [...e.jogadores.flatMap((j) => j.cartas), ...e.cartasNaMesa, ...e.baralho];
        expect(new Set(todas.map((c) => `${c.valor}${c.naipe}`)).size).toBe(52);
      }),
      { numRuns: 3_000 },
    );
  });
});
