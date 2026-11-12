import type Anthropic from '@anthropic-ai/sdk';
import { cartas, type VisaoDaMesa } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { recomendarComIA, type CriarMensagem } from './agente.js';
import { analisar } from './analise.js';
import { montarContexto, type ContextoDoJogador } from './contexto.js';

type Mensagem = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** Visão de um jogador no flop: ele tem As Ah, a mesa Ac 7d 2s, e um bot apostou 40. */
function visao(extra: Partial<VisaoDaMesa> = {}): VisaoDaMesa {
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
    ...extra,
  };
}

function contexto(v: VisaoDaMesa = visao()): ContextoDoJogador {
  const r = montarContexto(v);
  if (!r.ok) throw new Error(r.motivo);
  return r.contexto;
}

/** Gerador previsível (mulberry32): simulações reproduzíveis sem depender da sorte. */
function semente(n: number): () => number {
  let a = n;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPCOES = { simulacoes: 4_000, aleatorio: semente(7) };

/** Resposta falsa do Claude com os blocos dados. */
function mensagem(content: unknown[], stop_reason = 'tool_use'): Mensagem {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    usage: { input_tokens: 100, output_tokens: 20 },
  } as unknown as Mensagem;
}

const usar = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });

/** Claude simulado: devolve as respostas em sequência e guarda o que recebeu. */
function claudeFalso(respostas: Mensagem[]) {
  const chamadas: Params[] = [];
  const criar: CriarMensagem = async (params) => {
    chamadas.push(structuredClone(params));
    const r = respostas.shift();
    if (!r) throw new Error('sem mais respostas');
    return r;
  };
  return { criar, chamadas };
}

const RECOMENDACAO = {
  acao: 'aumentar',
  valor: 150,
  confianca: 'alta',
  resumo: 'Aumente para 150: você tem trinca de Ases.',
  explicacao: 'Com 95% de equity, você quer colocar mais fichas no pote.',
  alternativas: [{ acao: 'pagar', valor: null, quando: 'Para esconder a força da mão.' }],
  conceito: 'Apostar por valor.',
};

describe('agente coach', () => {
  it('usa as ferramentas e entrega uma recomendação validada', async () => {
    const c = contexto();
    const a = analisar(c, OPCOES);
    const { criar, chamadas } = claudeFalso([
      mensagem([
        usar('t1', 'calcular_equity', { oponentes: 1 }),
        usar('t2', 'avaliar_possibilidades', {}),
      ]),
      mensagem([usar('t3', 'entregar_recomendacao', RECOMENDACAO)]),
    ]);

    const r = await recomendarComIA(c, a, { ...OPCOES, criar, modelo: 'claude-opus-5-5' });

    expect(r.recomendacao).toMatchObject({
      fonte: 'ia',
      acao: 'aumentar',
      valor: 150,
      confianca: 'alta',
      aviso: null,
      alternativas: [{ acao: 'pagar', valor: 40 }],
    });
    expect(r.recomendacao.ferramentasUsadas).toEqual([
      'calcular_equity',
      'avaliar_possibilidades',
      'entregar_recomendacao',
    ]);
    expect(r.tokensDeEntrada).toBe(200);

    // A segunda chamada leva os resultados das ferramentas, com números reais.
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0]?.model).toBe('claude-opus-5-5');
    expect(chamadas[0]?.fallbacks).toBe('default');
    const resultados = JSON.stringify(chamadas[1]?.messages.at(-1));
    expect(resultados).toContain('equity_pct');
    expect(resultados).toContain('possibilidades');
  });

  it('ajusta valores fora do intervalo permitido', async () => {
    const c = contexto();
    const { criar } = claudeFalso([
      mensagem([usar('t1', 'entregar_recomendacao', { ...RECOMENDACAO, valor: 99_999 })]),
    ]);
    const r = await recomendarComIA(c, analisar(c, OPCOES), { ...OPCOES, criar, modelo: 'm' });
    expect(r.recomendacao.valor).toBe(980);
  });

  it('jogada não permitida cai no coach por regras', async () => {
    const c = contexto();
    const { criar } = claudeFalso([
      mensagem([usar('t1', 'entregar_recomendacao', { ...RECOMENDACAO, acao: 'passar' })]),
    ]);
    const r = await recomendarComIA(c, analisar(c, OPCOES), { ...OPCOES, criar, modelo: 'm' });
    expect(r.recomendacao.fonte).toBe('regras');
    expect(r.recomendacao.aviso).toMatch(/não é permitida/);
  });

  it('recusa do modelo cai no coach por regras', async () => {
    const c = contexto();
    const { criar } = claudeFalso([mensagem([], 'refusal')]);
    const r = await recomendarComIA(c, analisar(c, OPCOES), { ...OPCOES, criar, modelo: 'm' });
    expect(r.recomendacao).toMatchObject({
      fonte: 'regras',
      aviso: expect.stringMatching(/recusou/),
    });
  });

  it('erro na chamada cai no coach por regras', async () => {
    const c = contexto();
    const { criar } = claudeFalso([]);
    const r = await recomendarComIA(c, analisar(c, OPCOES), { ...OPCOES, criar, modelo: 'm' });
    expect(r.recomendacao).toMatchObject({
      fonte: 'regras',
      aviso: expect.stringMatching(/Erro inesperado/),
    });
  });

  it('sem IA configurada, responde direto por regras', async () => {
    const c = contexto();
    const r = await recomendarComIA(c, analisar(c, OPCOES), {
      ...OPCOES,
      criar: null,
      modelo: 'm',
      motivoSemIA: 'sem chave',
    });
    expect(r.recomendacao).toMatchObject({ fonte: 'regras', aviso: 'sem chave' });
    // Com trinca de Ases, o coach por regras recomenda subir.
    expect(['aumentar', 'all-in']).toContain(r.recomendacao.acao);
  });

  it('nunca envia à IA cartas de adversários, mesmo se viessem na visão', async () => {
    const vazada = visao();
    const comCartasDoBot = {
      ...vazada,
      jogadores: vazada.jogadores.map((j) =>
        j.id === 'bot' ? { ...j, cartas: cartas('Kd Kc') } : j,
      ),
    };
    const c = contexto(comCartasDoBot);
    const { criar, chamadas } = claudeFalso([
      mensagem([usar('t1', 'entregar_recomendacao', RECOMENDACAO)]),
    ]);
    await recomendarComIA(c, analisar(c, OPCOES), { ...OPCOES, criar, modelo: 'm' });

    const enviado = JSON.stringify(chamadas[0]?.messages);
    expect(enviado).toContain('As');
    expect(enviado).not.toContain('Kd');
    expect(enviado).not.toContain('Kc');
  });
});

describe('montarContexto', () => {
  it('só analisa na vez do jogador', () => {
    expect(montarContexto(visao({ voce: { id: 'eu', sentado: true, acoes: null } }))).toMatchObject(
      {
        ok: false,
        motivo: /quando for a sua vez/,
      },
    );
  });

  it('calcula pote total e quanto falta pagar', () => {
    const c = contexto();
    expect(c.pote).toBe(80);
    expect(c.paraPagar).toBe(40);
    expect(c.oponentes).toHaveLength(1);
    expect(c.posicao).toMatch(/botão/);
  });
});

describe('analisar', () => {
  it('trinca de Ases: pagar é bom, desistir é ruim, aumentar é bom', () => {
    const a = analisar(contexto(), OPCOES);
    expect(a.maoAtual).toBe('Trinca de Ases');
    expect(a.equity).toBeGreaterThan(0.85);
    expect(a.equityNecessaria).toBeCloseTo(1 / 3, 5);
    const avaliacao = (acao: string) => a.possibilidades.find((p) => p.acao === acao)?.avaliacao;
    expect(avaliacao('desistir')).toBe('ruim');
    expect(avaliacao('pagar')).toBe('boa');
    expect(avaliacao('aumentar')).toBe('boa');
  });

  it('mão fraca contra aposta grande: desistir é bom', () => {
    const v = visao();
    const fraca = {
      ...v,
      jogadores: v.jogadores.map((j) => (j.id === 'eu' ? { ...j, cartas: cartas('9h 4c') } : j)),
    };
    const a = analisar(contexto(fraca), OPCOES);
    expect(a.possibilidades.find((p) => p.acao === 'desistir')?.avaliacao).toBe('boa');
  });
});
