/**
 * Uma mesa em funcionamento: assentos, sequência de mãos, botão, tempo de cada jogada e
 * bots. Usa o motor (funções puras) para as regras, e cuida de tudo que depende de tempo
 * e de pessoas entrando e saindo.
 *
 * Não sabe nada de rede: avisa mudanças por `aoMudar` e quem está em volta (o servidor
 * Socket.IO, ou um teste) decide o que fazer.
 */
import { randomUUID } from 'node:crypto';
import type { Acao, Fichas, Resposta, ResumoDaMesa, VisaoDaMesa } from '@poker/shared-types';
import { decidirJogadaDoBot, type EntradaDoBot } from '../bots/bot-simples.js';
import { acoesDaVez, aplicarAcao, iniciarMao, type EstadoDaMao } from '../motor/index.js';
import { montarVisao, type Assento } from './visao.js';

export interface OpcoesDaMesa {
  readonly id: string;
  readonly nome: string;
  readonly smallBlind: Fichas;
  readonly bigBlind: Fichas;
  readonly maxJogadores?: number;
  /** Fichas virtuais ao sentar. Padrão: 100 big blinds. */
  readonly stackInicial?: Fichas;
  readonly tempoDaVezMs?: number;
  readonly pausaEntreMaosMs?: number;
  readonly atrasoDoBotMs?: number;
  readonly aoMudar?: () => void;
  readonly decidirBot?: (entrada: EntradaDoBot) => Acao;
}

const NOMES_DE_BOTS = [
  'Ada',
  'Turing',
  'Hopper',
  'Lovelace',
  'Dijkstra',
  'Knuth',
  'Liskov',
  'Ritchie',
];

export class MesaAoVivo {
  readonly id: string;
  readonly nome: string;
  private readonly opcoes: Required<Omit<OpcoesDaMesa, 'id' | 'nome' | 'aoMudar'>> & {
    aoMudar: () => void;
  };
  private readonly assentos: (Assento | null)[];
  private mao: EstadoDaMao | null = null;
  private numeroDaMao = 0;
  private assentoDoBotao: number | null = null;
  private prazoDaVez: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private emPausa = false;

  constructor(o: OpcoesDaMesa) {
    this.id = o.id;
    this.nome = o.nome;
    this.opcoes = {
      smallBlind: o.smallBlind,
      bigBlind: o.bigBlind,
      maxJogadores: o.maxJogadores ?? 6,
      stackInicial: o.stackInicial ?? o.bigBlind * 100,
      tempoDaVezMs: o.tempoDaVezMs ?? 30_000,
      pausaEntreMaosMs: o.pausaEntreMaosMs ?? 5_000,
      atrasoDoBotMs: o.atrasoDoBotMs ?? 1_200,
      aoMudar: o.aoMudar ?? (() => {}),
      decidirBot: o.decidirBot ?? ((entrada) => decidirJogadaDoBot(entrada)),
    };
    this.assentos = new Array<Assento | null>(this.opcoes.maxJogadores).fill(null);
  }

  // ---------- Comandos (vindos de jogadores) ----------

  sentar(id: string, nome: string, ehBot = false): Resposta {
    const existente = this.assentoDe(id);
    if (existente) {
      existente.conectado = true;
      existente.saindo = false;
      this.mudou();
      return { ok: true };
    }
    const livre = this.assentos.indexOf(null);
    if (livre === -1) return { ok: false, motivo: 'A mesa está cheia.' };

    this.assentos[livre] = {
      id,
      nome,
      stack: this.opcoes.stackInicial,
      ehBot,
      conectado: true,
      saindo: false,
    };
    this.mudou();
    this.talvezIniciarMao();
    return { ok: true };
  }

  adicionarBot(): Resposta {
    const usados = new Set(this.assentos.map((a) => a?.nome));
    const nome = NOMES_DE_BOTS.find((n) => !usados.has(`${n} (bot)`)) ?? 'Bot';
    return this.sentar(`bot-${randomUUID()}`, `${nome} (bot)`, true);
  }

  levantar(id: string): void {
    const i = this.assentos.findIndex((a) => a?.id === id);
    const assento = this.assentos[i];
    if (!assento) return;

    const naMao = this.mao?.jogadores.find((j) => j.id === id);
    const jogandoAinda =
      this.mao !== null &&
      this.mao.fase !== 'encerrada' &&
      naMao !== undefined &&
      naMao.situacao !== 'desistiu';
    if (!jogandoAinda) {
      this.assentos[i] = null;
    } else {
      assento.saindo = true;
      if (this.vezDe() === id) this.jogarAutomatico(id);
    }
    this.mudou();
  }

  definirConexao(id: string, conectado: boolean): void {
    const assento = this.assentoDe(id);
    if (!assento || assento.conectado === conectado) return;
    assento.conectado = conectado;
    this.mudou();
  }

  agir(id: string, acao: Acao): Resposta {
    if (!this.mao) return { ok: false, motivo: 'Nenhuma mão em andamento.' };
    const r = aplicarAcao(this.mao, id, acao);
    if (!r.ok) return r;
    this.mao = r.estado;
    this.depoisDeMudarAMao();
    return { ok: true };
  }

  // ---------- Consultas ----------

  visao(quemVe: string | null): VisaoDaMesa {
    return montarVisao(
      {
        id: this.id,
        nome: this.nome,
        smallBlind: this.opcoes.smallBlind,
        bigBlind: this.opcoes.bigBlind,
        assentos: this.assentos,
        mao: this.mao,
        numeroDaMao: this.numeroDaMao,
        assentoDoBotao: this.assentoDoBotao,
        prazoDaVez: this.prazoDaVez,
      },
      quemVe,
    );
  }

  resumo(): ResumoDaMesa {
    const ocupados = this.assentos.filter((a): a is Assento => a !== null);
    return {
      id: this.id,
      nome: this.nome,
      smallBlind: this.opcoes.smallBlind,
      bigBlind: this.opcoes.bigBlind,
      jogadores: ocupados.length,
      bots: ocupados.filter((a) => a.ehBot).length,
      maxJogadores: this.opcoes.maxJogadores,
    };
  }

  estaSentado(id: string): boolean {
    return this.assentoDe(id) !== undefined;
  }

  /** Para encerrar o servidor ou um teste sem deixar timers pendurados. */
  encerrar(): void {
    this.limparTimer();
  }

  // ---------- Ciclo das mãos ----------

  private talvezIniciarMao(): void {
    if ((this.mao && this.mao.fase !== 'encerrada') || this.emPausa) return;

    const prontos = this.assentos.flatMap((a, i) => (a && a.stack > 0 && !a.saindo ? [i] : []));
    // Precisa de 2 jogadores e de pelo menos um humano: bots não jogam sozinhos.
    if (prontos.length < 2 || prontos.every((i) => this.assentos[i]?.ehBot)) return;

    const anterior = this.assentoDoBotao ?? -1;
    const botao = prontos.find((i) => i > anterior) ?? (prontos[0] as number);
    this.assentoDoBotao = botao;
    this.numeroDaMao++;
    this.mao = iniciarMao({
      config: { smallBlind: this.opcoes.smallBlind, bigBlind: this.opcoes.bigBlind },
      jogadores: prontos.map((i) => {
        const a = this.assentos[i] as Assento;
        return { id: a.id, assento: i, stack: a.stack };
      }),
      assentoDoBotao: botao,
    });
    this.depoisDeMudarAMao();
  }

  private depoisDeMudarAMao(): void {
    this.limparTimer();
    this.prazoDaVez = null;
    const mao = this.mao;
    if (!mao) return;

    if (mao.fase === 'encerrada') {
      this.finalizarMao(mao);
    } else {
      this.agendarVez(mao);
    }
    this.mudou();
  }

  private agendarVez(mao: EstadoDaMao): void {
    const id = this.vezDe();
    const assento = id ? this.assentoDe(id) : undefined;
    if (!id || !assento) return;

    if (assento.saindo) {
      this.timer = setTimeout(() => this.jogarAutomatico(id), 0);
    } else if (assento.ehBot) {
      this.timer = setTimeout(() => this.jogarBot(id, mao), this.opcoes.atrasoDoBotMs);
    } else {
      this.prazoDaVez = Date.now() + this.opcoes.tempoDaVezMs;
      this.timer = setTimeout(() => this.tempoEsgotado(id), this.opcoes.tempoDaVezMs);
    }
  }

  private tempoEsgotado(id: string): void {
    const assento = this.assentoDe(id);
    // Desconectado e sem jogar a tempo: sai da mesa ao fim da mão.
    if (assento && !assento.conectado) assento.saindo = true;
    this.jogarAutomatico(id);
  }

  /** Jogada automática: passa se for de graça, senão desiste. */
  private jogarAutomatico(id: string): void {
    if (!this.mao || this.vezDe() !== id) return;
    const acoes = acoesDaVez(this.mao);
    this.agir(id, acoes?.passar ? { tipo: 'passar' } : { tipo: 'desistir' });
  }

  private jogarBot(id: string, mao: EstadoDaMao): void {
    if (this.mao !== mao || this.vezDe() !== id) return;
    const acoes = acoesDaVez(mao);
    const jogador = mao.jogadores.find((j) => j.id === id);
    if (!acoes || !jogador) return;

    const acao = this.opcoes.decidirBot({
      cartas: jogador.cartas,
      cartasNaMesa: mao.cartasNaMesa,
      acoes,
      pote: mao.jogadores.reduce((soma, j) => soma + j.totalApostado, 0),
      bigBlind: this.opcoes.bigBlind,
    });
    if (!this.agir(id, acao).ok) this.jogarAutomatico(id);
  }

  private finalizarMao(mao: EstadoDaMao): void {
    for (const j of mao.jogadores) {
      const assento = this.assentoDe(j.id);
      if (assento) assento.stack = j.stack;
    }
    // Quem pediu para sair ou ficou sem fichas deixa a mesa.
    this.assentos.forEach((a, i) => {
      if (a && (a.saindo || a.stack === 0)) this.assentos[i] = null;
    });

    this.emPausa = true;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emPausa = false;
      this.talvezIniciarMao();
      this.mudou();
    }, this.opcoes.pausaEntreMaosMs);
  }

  // ---------- Auxiliares ----------

  private vezDe(): string | null {
    const mao = this.mao;
    return mao && mao.vez !== null ? (mao.jogadores[mao.vez]?.id ?? null) : null;
  }

  private assentoDe(id: string): Assento | undefined {
    return this.assentos.find((a): a is Assento => a?.id === id);
  }

  private limparTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private mudou(): void {
    this.opcoes.aoMudar();
  }
}
