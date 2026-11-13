/** Dados de teste compartilhados (fora do build do serviço). */
import { cartas, type VisaoDaMesa } from '@poker/shared-types';
import { montarContexto, type ContextoDoJogador } from '../contexto.js';

/** Gerador previsível (mulberry32): simulações reproduzíveis. */
export function semente(n: number): () => number {
  let a = n;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Visão de um jogador no flop: ele tem As Ah, a mesa Ac 7d 2s, e um bot apostou 40. */
export function visaoNoFlop(): VisaoDaMesa {
  return {
    id: 'mesa',
    nome: 'Mesa',
    smallBlind: 5,
    bigBlind: 10,
    maxJogadores: 6,
    numeroDaMao: 7,
    fase: 'flop',
    jogadores: [
      {
        id: 'eu',
        nome: 'Davi',
        assento: 0,
        stack: 980,
        apostaNaRodada: 0,
        situacao: 'ativo',
        ehBot: false,
        conectado: true,
        cartas: cartas('As Ah'),
        quantidadeDeCartas: 2,
        ehBotao: true,
      },
      {
        id: 'bot',
        nome: 'Ada (bot)',
        assento: 1,
        stack: 940,
        apostaNaRodada: 40,
        situacao: 'ativo',
        ehBot: true,
        conectado: true,
        cartas: null,
        quantidadeDeCartas: 2,
        ehBotao: false,
      },
    ],
    cartasNaMesa: cartas('Ac 7d 2s'),
    pote: 40,
    maiorAposta: 40,
    vezDe: 'eu',
    prazoDaVez: null,
    voce: {
      id: 'eu',
      sentado: true,
      acoes: {
        desistir: true,
        passar: false,
        pagar: 40,
        aumentar: { minimo: 80, maximo: 980 },
        allIn: 980,
      },
    },
    eventos: [
      { tipo: 'inicio', botao: 'eu' },
      { tipo: 'cartas', fase: 'flop', cartas: cartas('Ac 7d 2s') },
      { tipo: 'acao', jogadorId: 'bot', acao: 'apostar', apostaTotal: 40, allIn: false },
    ],
    resultado: null,
  };
}

export function contextoNoFlop(): ContextoDoJogador {
  const r = montarContexto(visaoNoFlop());
  if (!r.ok) throw new Error(r.motivo);
  return r.contexto;
}

export const RECOMENDACAO_VALIDA = {
  acao: 'aumentar',
  valor: 150,
  confianca: 'alta',
  resumo: 'Aumente para 150: você tem trinca de Ases.',
  explicacao: 'Com 95% de equity, você quer colocar mais fichas no pote.',
  alternativas: [{ acao: 'pagar', valor: null, quando: 'Para esconder a força da mão.' }],
  conceito: 'Apostar por valor.',
};
