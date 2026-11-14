/**
 * Efeitos sonoros em estilo 8-bit, sintetizados na hora com a Web Audio API (ondas
 * quadradas e ruído). Não há arquivos de áudio: cada som é uma pequena receita de notas.
 */
import type { VisaoDaMesa } from '@poker/shared-types';
import { useEffect, useRef, useSyncExternalStore } from 'react';

export type Som =
  'carta' | 'ficha' | 'recolher' | 'suaVez' | 'vitoria' | 'passar' | 'desistir' | 'allIn';

const CHAVE_SOM = 'poker:som';
const VOLUME = 0.16;
/** Dois sons iguais mais próximos que isso viram um só (evita estouro com muitas fichas). */
const INTERVALO_MINIMO_MS = 45;

let contexto: AudioContext | null = null;
let saida: GainNode | null = null;
const ultimoToque = new Map<Som, number>();

// ---------- Liga/desliga (guardado no navegador) ----------

function lerLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE_SOM) !== 'desligado';
  } catch {
    return true;
  }
}

let ligado = lerLigado();
const ouvintes = new Set<() => void>();

export function alternarSom(): void {
  ligado = !ligado;
  try {
    localStorage.setItem(CHAVE_SOM, ligado ? 'ligado' : 'desligado');
  } catch {
    // sem armazenamento: vale só nesta aba
  }
  ouvintes.forEach((avisar) => avisar());
  if (ligado) tocar('ficha');
}

/** Estado do som para os componentes (re-renderiza quando alguém liga ou desliga). */
export function useSomLigado(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      ouvintes.add(avisar);
      return () => ouvintes.delete(avisar);
    },
    () => ligado,
  );
}

// ---------- Síntese ----------

function audio(): { ctx: AudioContext; saida: GainNode } | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!contexto || !saida) {
    contexto = new AudioContext();
    saida = contexto.createGain();
    saida.gain.value = VOLUME;
    saida.connect(contexto.destination);
  }
  // O navegador só libera o áudio depois de um clique; `resume` pega esse momento.
  if (contexto.state === 'suspended') void contexto.resume();
  return { ctx: contexto, saida };
}

// Qualquer clique ou tecla destrava o áudio para os sons que vêm do servidor depois.
if (typeof window !== 'undefined') {
  const destravar = () => {
    if (ligado) audio();
  };
  window.addEventListener('pointerdown', destravar, { once: true });
  window.addEventListener('keydown', destravar, { once: true });
}

interface Nota {
  freq: number;
  /** Segundos a partir do início do som. */
  em: number;
  dur: number;
  onda?: OscillatorType;
  vol?: number;
  /** Frequência no fim da nota (glissando). */
  ate?: number;
}

function nota({ ctx, saida }: { ctx: AudioContext; saida: GainNode }, t0: number, n: Nota) {
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  const inicio = t0 + n.em;
  const fim = inicio + n.dur;
  osc.type = n.onda ?? 'square';
  osc.frequency.setValueAtTime(n.freq, inicio);
  if (n.ate) osc.frequency.exponentialRampToValueAtTime(n.ate, fim);
  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(n.vol ?? 0.5, inicio + 0.005);
  ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
  osc.connect(ganho).connect(saida);
  osc.start(inicio);
  osc.stop(fim + 0.02);
}

/** Estalo curto de ruído filtrado: o "flip" do papel da carta. */
function ruido({ ctx, saida }: { ctx: AudioContext; saida: GainNode }, t0: number, dur: number) {
  const amostras = Math.ceil(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, amostras, ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < amostras; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / amostras);
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = 3200;
  filtro.Q.value = 0.8;
  const ganho = ctx.createGain();
  ganho.gain.value = 0.9;
  fonte.connect(filtro).connect(ganho).connect(saida);
  fonte.start(t0);
}

const RECEITAS: Record<Som, (a: { ctx: AudioContext; saida: GainNode }, t: number) => void> = {
  carta: (a, t) => {
    ruido(a, t, 0.06);
    nota(a, t, { freq: 1400, em: 0, dur: 0.03, vol: 0.12 });
  },
  ficha: (a, t) => {
    nota(a, t, { freq: 2093, em: 0, dur: 0.045, vol: 0.35 });
    nota(a, t, { freq: 2794, em: 0.035, dur: 0.06, vol: 0.25 });
  },
  recolher: (a, t) => {
    [1568, 1760, 2093, 2349].forEach((freq, i) =>
      nota(a, t, { freq, em: i * 0.035, dur: 0.05, vol: 0.25 }),
    );
  },
  suaVez: (a, t) => {
    nota(a, t, { freq: 784, em: 0, dur: 0.09, vol: 0.35 });
    nota(a, t, { freq: 1175, em: 0.1, dur: 0.16, vol: 0.35 });
  },
  vitoria: (a, t) => {
    [523, 659, 784, 1047].forEach((freq, i) =>
      nota(a, t, { freq, em: i * 0.09, dur: 0.1, vol: 0.4 }),
    );
    nota(a, t, { freq: 1319, em: 0.36, dur: 0.32, vol: 0.4 });
    nota(a, t, { freq: 659, em: 0.36, dur: 0.32, vol: 0.2, onda: 'triangle' });
  },
  passar: (a, t) => {
    nota(a, t, { freq: 180, em: 0, dur: 0.05, vol: 0.6, onda: 'triangle' });
    nota(a, t, { freq: 180, em: 0.09, dur: 0.05, vol: 0.6, onda: 'triangle' });
  },
  desistir: (a, t) => {
    nota(a, t, { freq: 520, em: 0, dur: 0.2, vol: 0.25, ate: 160 });
  },
  allIn: (a, t) => {
    nota(a, t, { freq: 220, em: 0, dur: 0.35, vol: 0.3, ate: 880 });
    nota(a, t, { freq: 1760, em: 0.36, dur: 0.12, vol: 0.3 });
  },
};

/** Toca um som agora ou daqui a `atrasoMs` (para coincidir com uma animação). */
export function tocar(som: Som, atrasoMs = 0): void {
  if (!ligado) return;
  const agora = performance.now() + atrasoMs;
  if (agora - (ultimoToque.get(som) ?? -Infinity) < INTERVALO_MINIMO_MS) return;
  ultimoToque.set(som, agora);
  const a = audio();
  if (!a) return;
  RECEITAS[som](a, a.ctx.currentTime + atrasoMs / 1000);
}

// ---------- Sons da mesa ----------

/** Quando as fichas pousam (ver a duração do voo em Fichas.tsx). */
const POUSO_DAS_FICHAS_MS = 420;

/**
 * Compara o estado anterior da mesa com o novo e toca os sons do que aconteceu:
 * cartas distribuídas e viradas, fichas, passe, desistência, all-in, a sua vez e vitória.
 */
export function useSonsDaMesa(visao: VisaoDaMesa, intervaloDoFlop: number): void {
  const anterior = useRef<VisaoDaMesa | null>(null);

  useEffect(() => {
    const ant = anterior.current;
    anterior.current = visao;
    if (!ant) return;

    const eu = visao.voce?.id;
    const mesmaMao = ant.numeroDaMao === visao.numeroDaMao;
    const novos = mesmaMao ? visao.eventos.slice(ant.eventos.length) : visao.eventos;

    for (const ev of novos) {
      switch (ev.tipo) {
        case 'inicio':
          [0, 1, 2].forEach((i) => tocar('carta', i * intervaloDoFlop));
          break;
        case 'blind':
          tocar('ficha', POUSO_DAS_FICHAS_MS);
          break;
        case 'acao':
          if (ev.allIn) tocar('allIn');
          else if (ev.acao === 'passar') tocar('passar');
          else if (ev.acao === 'desistir') tocar('desistir');
          else tocar('ficha', POUSO_DAS_FICHAS_MS);
          break;
        case 'cartas':
          ev.cartas.forEach((_, i) => tocar('carta', i * intervaloDoFlop));
          break;
        case 'showdown':
          tocar('carta');
          break;
        case 'pote':
          if (eu && ev.vencedores.includes(eu)) tocar('vitoria', 500);
          break;
      }
    }

    // Fim da rodada: as apostas vão para o pote.
    const apostavam = ant.jogadores.some((j) => j.apostaNaRodada > 0);
    const apostam = visao.jogadores.some((j) => j.apostaNaRodada > 0);
    if (mesmaMao && apostavam && !apostam) tocar('recolher', POUSO_DAS_FICHAS_MS);

    if (eu && visao.vezDe === eu && ant.vezDe !== eu) tocar('suaVez');
  }, [visao, intervaloDoFlop]);
}
