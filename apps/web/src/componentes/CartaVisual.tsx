import type { Carta } from '@poker/shared-types';
import { SIMBOLO, ehVermelha, letraDoValor, nomeDaCarta } from '../formatacao.js';

interface Props {
  carta?: Carta | null;
  pequena?: boolean;
  destaque?: boolean;
}

/** Carta virada para cima (com `carta`) ou para baixo (sem). */
export function CartaVisual({ carta, pequena, destaque }: Props) {
  const classes = ['carta', pequena && 'pequena', destaque && 'destaque'].filter(Boolean).join(' ');

  if (!carta) {
    return <span className={`${classes} verso`} role="img" aria-label="Carta virada para baixo" />;
  }
  return (
    <span
      className={`${classes} ${ehVermelha(carta) ? 'vermelha' : 'preta'}`}
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
