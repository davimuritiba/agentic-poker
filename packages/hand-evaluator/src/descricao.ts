import type { Valor } from '@poker/shared-types';
import type { AvaliacaoDeMao } from './avaliador.js';

const SINGULAR: Partial<Record<Valor, string>> = { 11: 'Valete', 12: 'Dama', 13: 'Rei', 14: 'Ás' };
const PLURAL: Partial<Record<Valor, string>> = {
  11: 'Valetes',
  12: 'Damas',
  13: 'Reis',
  14: 'Ases',
};

const um = (v: Valor | undefined) => (v === undefined ? '?' : (SINGULAR[v] ?? String(v)));
const varios = (v: Valor | undefined) => (v === undefined ? '?' : (PLURAL[v] ?? String(v)));

/** Descrição da mão em português, para a interface e o histórico. Ex.: "Par de Reis". */
export function descreverMao(mao: AvaliacaoDeMao): string {
  const [a, b] = mao.desempate;
  switch (mao.categoria) {
    case 'carta-alta':
      return `Carta alta: ${um(a)}`;
    case 'par':
      return `Par de ${varios(a)}`;
    case 'dois-pares':
      return `Dois pares: ${varios(a)} e ${varios(b)}`;
    case 'trinca':
      return `Trinca de ${varios(a)}`;
    case 'sequencia':
      return `Sequência até ${um(a)}`;
    case 'flush':
      return `Flush com ${um(a)}`;
    case 'full-house':
      return `Full house: ${varios(a)} com ${varios(b)}`;
    case 'quadra':
      return `Quadra de ${varios(a)}`;
    case 'straight-flush':
      return a === 14 ? 'Royal flush' : `Straight flush até ${um(a)}`;
  }
}
