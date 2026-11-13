import type { Acao, Fichas } from '@poker/shared-types';
import { acoesPermitidas } from './permitidas.js';
import type { Intervalo, SituacaoDeAposta } from './situacao.js';

/** O que a ação muda na mesa. O Game Engine aplica isso ao estado da mão. */
export interface EfeitoDaAcao {
  /** Tipo final da ação. Um all-in vira `pagar`, `apostar` ou `aumentar`, com `allIn = true`. */
  readonly tipo: 'desistir' | 'passar' | 'pagar' | 'apostar' | 'aumentar';
  /** Fichas que saem do stack do jogador e vão para a mesa. */
  readonly fichasColocadas: Fichas;
  /** Total apostado pelo jogador nesta rodada depois da ação. */
  readonly apostaTotal: Fichas;
  /** Verdadeiro se o jogador ficou sem fichas. */
  readonly allIn: boolean;
  readonly novaMaiorAposta: Fichas;
  readonly novoAumentoMinimo: Fichas;
  /**
   * Verdadeiro se foi uma aposta ou aumento completo: todos os outros jogadores voltam a
   * poder aumentar. Um all-in menor que um aumento completo sobe a aposta, mas não reabre.
   */
  readonly reabreAcao: boolean;
}

export type ResultadoDaValidacao =
  | { readonly valida: true; readonly efeito: EfeitoDaAcao }
  | { readonly valida: false; readonly motivo: string };

/** Confere se a ação é permitida na situação e, se for, calcula o efeito dela. */
export function validarAcao(s: SituacaoDeAposta, acao: Acao): ResultadoDaValidacao {
  const permitidas = acoesPermitidas(s);

  if (s.stack === 0) return invalida('O jogador já está all-in e não age mais nesta mão.');

  switch (acao.tipo) {
    case 'desistir':
      return valida(s, 'desistir', s.apostaDoJogador);

    case 'passar':
      return permitidas.passar
        ? valida(s, 'passar', s.apostaDoJogador)
        : invalida(`Não dá para passar: há ${s.maiorAposta - s.apostaDoJogador} fichas a pagar.`);

    case 'pagar':
      return permitidas.pagar !== undefined
        ? valida(s, 'pagar', s.apostaDoJogador + permitidas.pagar)
        : invalida('Não há aposta a pagar. Use passar.');

    case 'apostar':
      if (s.maiorAposta > 0) return invalida('Já existe aposta nesta rodada. Use aumentar.');
      return dentroDoIntervalo(s, 'apostar', acao.valor, permitidas.apostar);

    case 'aumentar':
      if (s.maiorAposta === 0) return invalida('Ainda não há aposta nesta rodada. Use apostar.');
      if (!s.podeAumentar) {
        return invalida('A ação não foi reaberta para você: só é possível pagar ou desistir.');
      }
      return dentroDoIntervalo(s, 'aumentar', acao.valor, permitidas.aumentar);

    case 'all-in': {
      if (permitidas.allIn === undefined) {
        return invalida('A ação não foi reaberta para você: só é possível pagar ou desistir.');
      }
      const total = permitidas.allIn;
      const tipo = total <= s.maiorAposta ? 'pagar' : s.maiorAposta === 0 ? 'apostar' : 'aumentar';
      return valida(s, tipo, total);
    }
  }
  // A ação chega pela rede: um cliente malicioso pode mandar um tipo que não existe.
  return invalida(`Ação desconhecida: ${String((acao as { tipo?: unknown }).tipo)}.`);
}

function dentroDoIntervalo(
  s: SituacaoDeAposta,
  tipo: 'apostar' | 'aumentar',
  valor: number,
  intervalo: Intervalo | undefined,
): ResultadoDaValidacao {
  if (!intervalo) {
    return invalida(`Fichas insuficientes para ${tipo}: o máximo possível é pagar.`);
  }
  if (!Number.isSafeInteger(valor)) {
    return invalida(`Valor inválido: ${valor}. Fichas são sempre números inteiros.`);
  }
  if (valor > intervalo.maximo) {
    return invalida(`Valor ${valor} maior que o máximo possível (${intervalo.maximo}).`);
  }
  if (valor < intervalo.minimo) {
    return invalida(
      `Valor ${valor} abaixo do mínimo (${intervalo.minimo}). ` +
        `Com menos que isso, só indo all-in.`,
    );
  }
  return valida(s, tipo, valor);
}

function valida(
  s: SituacaoDeAposta,
  tipo: EfeitoDaAcao['tipo'],
  apostaTotal: Fichas,
): ResultadoDaValidacao {
  const fichasColocadas = apostaTotal - s.apostaDoJogador;
  const aumento = Math.max(0, apostaTotal - s.maiorAposta);
  const completo = aumento > 0 && aumento >= s.aumentoMinimo;

  return {
    valida: true,
    efeito: {
      tipo,
      fichasColocadas,
      apostaTotal,
      allIn: fichasColocadas === s.stack && tipo !== 'desistir' && tipo !== 'passar',
      novaMaiorAposta: Math.max(s.maiorAposta, apostaTotal),
      novoAumentoMinimo: completo ? aumento : s.aumentoMinimo,
      reabreAcao: completo,
    },
  };
}

function invalida(motivo: string): ResultadoDaValidacao {
  return { valida: false, motivo };
}
