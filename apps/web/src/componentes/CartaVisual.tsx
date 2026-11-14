import type { Carta } from '@poker/shared-types';
import type { CSSProperties } from 'react';
import { SIMBOLO, ehVermelha, letraDoValor, nomeDaCarta } from '../formatacao.js';

interface Props {
  carta?: Carta | null;
  pequena?: boolean;
  destaque?: boolean;
  /**
   * Animação ao aparecer: `virar` mostra o verso e gira até a face (flip); `dar` faz a carta
   * cair na mesa, como se tivesse sido distribuída. Roda quando o elemento é montado, então
   * quem usa dá uma `key` diferente para cada carta.
   */
  animacao?: 'virar' | 'dar';
  /** Espera antes de animar, em ms (para virar o flop uma carta de cada vez). */
  atraso?: number;
}

/** Chave estável de uma carta, para remontar (e animar) quando a carta muda. */
export const chaveDaCarta = (c: Carta) => `${c.valor}${c.naipe}`;

/** Carta virada para cima (com `carta`) ou para baixo (sem). */
export function CartaVisual({ carta, pequena, destaque, animacao, atraso }: Props) {
  const classes = ['carta', pequena && 'pequena', destaque && 'destaque', animacao]
    .filter(Boolean)
    .join(' ');
  const estilo = atraso ? ({ '--atraso': `${atraso}ms` } as CSSProperties) : undefined;

  if (!carta) {
    return (
      <span
        className={`${classes} verso`}
        style={estilo}
        role="img"
        aria-label="Carta virada para baixo"
      />
    );
  }
  return (
    <span
      className={`${classes} ${ehVermelha(carta) ? 'vermelha' : 'preta'}`}
      style={estilo}
      role="img"
      aria-label={nomeDaCarta(carta)}
    >
      <span className="valor">{letraDoValor(carta.valor)}</span>
      <span className="naipe">{SIMBOLO[carta.naipe]}</span>
    </span>
  );
}

/** Espaço vazio na mesa onde uma carta comunitária ainda vai aparecer. */
export function EspacoDeCarta() {
  return <span className="carta espaco" aria-hidden="true" />;
}
