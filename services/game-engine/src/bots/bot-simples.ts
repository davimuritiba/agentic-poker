/**
 * Bot oponente simples, baseado em regras. É provisório: na Sprint 4 o "cérebro" vira
 * um motor de decisão por simulação Monte Carlo, atrás do Agent Orchestrator.
 *
 * O bot só recebe o que um jogador humano veria: as próprias cartas, as cartas da mesa
 * e as ações permitidas. Nunca as cartas dos adversários.
 */
import { CATEGORIAS, avaliarMao } from '@poker/hand-evaluator';
import type { Acao, AcoesPermitidas, Carta, Fichas, Intervalo } from '@poker/shared-types';

export interface EntradaDoBot {
  readonly cartas: readonly Carta[];
  readonly cartasNaMesa: readonly Carta[];
  readonly acoes: AcoesPermitidas;
  /** Total já no pote, incluindo as apostas da rodada. */
  readonly pote: Fichas;
  readonly bigBlind: Fichas;
}

/** Força estimada da mão, de 0 (muito fraca) a 1 (muito forte). */
export function forcaDaMao(cartas: readonly Carta[], mesa: readonly Carta[]): number {
  const [a, b] = cartas;
  if (!a || !b) return 0;

  if (mesa.length === 0) {
    const alta = Math.max(a.valor, b.valor);
    const baixa = Math.min(a.valor, b.valor);
    if (a.valor === b.valor) return 0.5 + alta / 28; // pares: 22 ≈ 0,57 ... AA = 1
    let forca = (alta / 14) * 0.45 + (baixa / 14) * 0.2;
    if (a.naipe === b.naipe) forca += 0.08;
    if (alta - baixa <= 2) forca += 0.05;
    return forca; // AKs ≈ 0,77 ... 72o ≈ 0,25
  }

  const mao = avaliarMao([...cartas, ...mesa]);
  const categoria = CATEGORIAS.indexOf(mao.categoria);
  if (categoria === 0) return Math.max(a.valor, b.valor) >= 13 ? 0.25 : 0.15;
  if (categoria === 1) {
    // Par que usa uma carta da mão vale mais que um par só da mesa.
    const usaCartaPropria = cartas.some((c) => c.valor === mao.desempate[0]);
    return usaCartaPropria ? 0.45 + (mao.desempate[0] ?? 0) / 100 : 0.25;
  }
  return Math.min(0.6 + categoria * 0.05, 1);
}

export function decidirJogadaDoBot(e: EntradaDoBot, aleatorio: () => number = Math.random): Acao {
  const { acoes } = e;
  const forca = forcaDaMao(e.cartas, e.cartasNaMesa);
  const paraPagar = acoes.pagar ?? 0;
  const precoDoPote = paraPagar / (e.pote + paraPagar || 1);
  const sorte = aleatorio();

  const subir = (fracaoDoPote: number): Acao | null => {
    const tipo = acoes.apostar ? 'apostar' : acoes.aumentar ? 'aumentar' : null;
    if (!tipo) return null;
    const intervalo = acoes[tipo] as Intervalo;
    const desejado = intervalo.minimo + Math.round(e.pote * fracaoDoPote);
    const valor = Math.min(Math.max(desejado, intervalo.minimo), intervalo.maximo);
    return { tipo, valor };
  };
  const pagarOuPassar = (): Acao =>
    acoes.passar
      ? { tipo: 'passar' }
      : acoes.pagar !== undefined
        ? { tipo: 'pagar' }
        : { tipo: 'desistir' };
  const passarOuDesistir = (): Acao => (acoes.passar ? { tipo: 'passar' } : { tipo: 'desistir' });

  if (forca >= 0.75) {
    return (sorte < 0.75 && subir(0.6)) || pagarOuPassar();
  }
  if (forca >= 0.5) {
    if (acoes.passar) return (sorte < 0.3 && subir(0.4)) || { tipo: 'passar' };
    return precoDoPote <= forca * 0.6 ? pagarOuPassar() : { tipo: 'desistir' };
  }
  // Mão fraca: passa quando é de graça, paga só se for barato, às vezes blefa.
  if (acoes.passar) return (sorte < 0.08 && subir(0.5)) || { tipo: 'passar' };
  if (paraPagar <= e.bigBlind && sorte < 0.5) return pagarOuPassar();
  return precoDoPote < 0.15 ? pagarOuPassar() : passarOuDesistir();
}
