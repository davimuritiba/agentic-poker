/**
 * Fichas em pixel art: o desenho de uma ficha (sprite 8×8), pilhas para apostas e pote, e
 * a camada que anima as fichas voando pela mesa (aposta, recolhimento ao pote e pagamento).
 */
import type { VisaoDaMesa } from '@poker/shared-types';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

// ---------- Desenho ----------

/** o = contorno, c = cor da ficha, l = centro mais claro, w = marcas da borda. */
const SPRITE = [
  '..oooo..',
  '.owccwo.',
  'owcllcwo',
  'occllcco',
  'occllcco',
  'owcllcwo',
  '.owccwo.',
  '..oooo..',
];

interface Paleta {
  o: string;
  c: string;
  l: string;
  w: string;
}

/** Valores das fichas, do maior para o menor, com as cores de cada um. */
const DENOMINACOES: readonly { valor: number; paleta: Paleta }[] = [
  { valor: 5000, paleta: { o: '#5e2606', c: '#e06a1f', l: '#f59050', w: '#fff3e0' } },
  { valor: 1000, paleta: { o: '#5f420a', c: '#d99e1e', l: '#f5c542', w: '#fffbe6' } },
  { valor: 500, paleta: { o: '#311852', c: '#7a3fb8', l: '#9d68d8', w: '#f3e8ff' } },
  { valor: 100, paleta: { o: '#0a0a0d', c: '#2b2b33', l: '#4a4a56', w: '#f5c542' } },
  { valor: 25, paleta: { o: '#123a1c', c: '#2e8b47', l: '#52b46a', w: '#eafff0' } },
  { valor: 5, paleta: { o: '#521217', c: '#c8323a', l: '#e2585f', w: '#fff0f0' } },
  { valor: 1, paleta: { o: '#3a3a3a', c: '#cfcfcf', l: '#f2f2f2', w: '#5b6bd6' } },
];

/** Um caminho SVG por cor, montado uma vez a partir do sprite. */
const CAMINHOS: Record<keyof Paleta, string> = (() => {
  const caminhos = { o: '', c: '', l: '', w: '' };
  SPRITE.forEach((linha, y) =>
    [...linha].forEach((px, x) => {
      if (px !== '.') caminhos[px as keyof Paleta] += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return caminhos;
})();

const PALETA_PADRAO: Paleta = { o: '#3a3a3a', c: '#cfcfcf', l: '#f2f2f2', w: '#5b6bd6' };

function paletaDe(valor: number): Paleta {
  return DENOMINACOES.find((d) => d.valor === valor)?.paleta ?? PALETA_PADRAO;
}

/** Quebra um valor em fichas, das maiores para as menores. */
export function decompor(valor: number): number[] {
  const fichas: number[] = [];
  let resto = Math.max(0, Math.floor(valor));
  for (const d of DENOMINACOES) {
    while (resto >= d.valor && fichas.length < 60) {
      fichas.push(d.valor);
      resto -= d.valor;
    }
  }
  return fichas;
}

export function FichaPixel({ valor, className }: { valor: number; className?: string }) {
  const p = paletaDe(valor);
  return (
    <svg
      className={className ? `ficha ${className}` : 'ficha'}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {(Object.keys(CAMINHOS) as (keyof Paleta)[]).map((cor) => (
        <path key={cor} d={CAMINHOS[cor]} fill={p[cor]} />
      ))}
    </svg>
  );
}

/** Pilha com as maiores fichas do valor (a maior embaixo). */
export function PilhaDeFichas({ valor, maximo = 4 }: { valor: number; maximo?: number }) {
  const fichas = decompor(valor).slice(0, maximo);
  if (fichas.length === 0) return null;
  return (
    <span className="pilha" style={{ height: `${16 + (fichas.length - 1) * 3}px` }}>
      {fichas.map((v, i) => (
        <FichaPixel key={i} valor={v} />
      ))}
    </span>
  );
}

// ---------- Animação ----------

interface Ponto {
  x: number;
  y: number;
}

interface Voo {
  id: number;
  de: Ponto;
  para: Ponto;
  valor: number;
  atraso: number;
}

const DURACAO = 480;
const INTERVALO_ENTRE_FICHAS = 70;
const ATRASO_DO_PAGAMENTO = 520;

const movimentoReduzido = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Compara o estado anterior da mesa com o atual e solta fichas voando:
 * - aposta que cresceu: do jogador até a frente dele;
 * - aposta que sumiu (fim da rodada): da frente do jogador até o pote;
 * - resultado da mão: do pote até cada vencedor.
 */
export function CamadaDeFichas({
  visao,
  feltro,
}: {
  visao: VisaoDaMesa;
  feltro: RefObject<HTMLDivElement | null>;
}) {
  const [voos, setVoos] = useState<Voo[]>([]);
  const anterior = useRef<VisaoDaMesa | null>(null);
  const ultimasApostas = useRef(new Map<string, Ponto>());
  const proximoId = useRef(0);

  useLayoutEffect(() => {
    const raiz = feltro.current;
    const ant = anterior.current;
    anterior.current = visao;
    if (!raiz) return;

    const caixa = raiz.getBoundingClientRect();
    const centro = (seletor: string): Ponto | null => {
      const el = raiz.querySelector(seletor);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - caixa.left - raiz.clientLeft,
        y: r.top + r.height / 2 - caixa.top - raiz.clientTop,
      };
    };
    const doJogador = (id: string) => centro(`[data-jogador="${CSS.escape(id)}"] .placa`);
    const daAposta = (id: string) => centro(`[data-aposta="${CSS.escape(id)}"]`);
    const doPote = () => centro('[data-pote]');

    const novos: Omit<Voo, 'id'>[] = [];
    if (ant && !movimentoReduzido()) {
      const mesmaMao = ant.numeroDaMao === visao.numeroDaMao;
      let recolheu = false;

      for (const j of visao.jogadores) {
        const antes = mesmaMao
          ? (ant.jogadores.find((a) => a.id === j.id)?.apostaNaRodada ?? 0)
          : 0;
        if (j.apostaNaRodada > antes) {
          const de = doJogador(j.id);
          const para = daAposta(j.id);
          if (de && para) novos.push({ de, para, valor: j.apostaNaRodada - antes, atraso: 0 });
        }
      }

      if (mesmaMao) {
        const pote = doPote();
        for (const a of ant.jogadores) {
          const agora = visao.jogadores.find((j) => j.id === a.id)?.apostaNaRodada ?? 0;
          const de = ultimasApostas.current.get(a.id);
          if (a.apostaNaRodada > 0 && agora < a.apostaNaRodada && de && pote) {
            novos.push({ de, para: pote, valor: a.apostaNaRodada, atraso: 0 });
            recolheu = true;
          }
        }
      }

      if (visao.resultado && (!ant.resultado || !mesmaMao)) {
        const pote = doPote();
        for (const [id, ganho] of Object.entries(visao.resultado.ganhos)) {
          const para = doJogador(id);
          if (ganho > 0 && pote && para) {
            novos.push({
              de: pote,
              para,
              valor: ganho,
              atraso: recolheu ? ATRASO_DO_PAGAMENTO : 0,
            });
          }
        }
      }
    }

    // Guarda onde está cada aposta: quando ela sumir, é daqui que as fichas saem.
    ultimasApostas.current.clear();
    for (const j of visao.jogadores) {
      const p = j.apostaNaRodada > 0 ? daAposta(j.id) : null;
      if (p) ultimasApostas.current.set(j.id, p);
    }

    if (novos.length > 0) {
      setVoos((atuais) => [...atuais, ...novos.map((v) => ({ ...v, id: proximoId.current++ }))]);
    }
  }, [visao, feltro]);

  const terminar = (id: number) => setVoos((atuais) => atuais.filter((v) => v.id !== id));

  return (
    <div className="camada-de-fichas" aria-hidden="true">
      {voos.map((v) => (
        <VooDeFichas key={v.id} voo={v} aoTerminar={() => terminar(v.id)} />
      ))}
    </div>
  );
}

/** Algumas fichas (as maiores do valor) fazendo um arco de um ponto a outro. */
function VooDeFichas({ voo, aoTerminar }: { voo: Voo; aoTerminar: () => void }) {
  const fichas = decompor(voo.valor).slice(0, 4);
  const restantes = useRef(fichas.length);
  const chegou = () => {
    restantes.current -= 1;
    if (restantes.current === 0) aoTerminar();
  };
  return (
    <>
      {fichas.map((valor, i) => (
        <FichaVoando
          key={i}
          valor={valor}
          de={voo.de}
          para={voo.para}
          atraso={voo.atraso + i * INTERVALO_ENTRE_FICHAS}
          aoChegar={chegou}
        />
      ))}
    </>
  );
}

function FichaVoando(props: {
  valor: number;
  de: Ponto;
  para: Ponto;
  atraso: number;
  aoChegar: () => void;
}) {
  const el = useRef<HTMLSpanElement>(null);
  const aoChegar = useRef(props.aoChegar);
  aoChegar.current = props.aoChegar;
  const { de, para, atraso } = props;

  useLayoutEffect(() => {
    const no = el.current;
    if (!no) return;
    // Arco proporcional à distância, sempre para cima, como uma ficha jogada na mesa.
    const distancia = Math.hypot(para.x - de.x, para.y - de.y);
    const altura = Math.min(48, 14 + distancia * 0.18);
    const pos = (p: Ponto, subida = 0) =>
      `translate(${Math.round(p.x - 8)}px, ${Math.round(p.y - 8 - subida)}px)`;
    const meio = { x: (de.x + para.x) / 2, y: (de.y + para.y) / 2 };

    const animacao = no.animate(
      [
        { transform: pos(de), opacity: 0 },
        { transform: pos(de, 4), opacity: 1, offset: 0.08 },
        { transform: pos(meio, altura), offset: 0.5 },
        { transform: pos(para), opacity: 1, offset: 0.92 },
        { transform: pos(para), opacity: 0 },
      ],
      { duration: DURACAO, delay: atraso, easing: 'ease-in-out', fill: 'both' },
    );
    animacao.onfinish = () => aoChegar.current();
    return () => animacao.cancel();
  }, [de, para, atraso]);

  return (
    <span ref={el} className="ficha-voando">
      <FichaPixel valor={props.valor} />
    </span>
  );
}
