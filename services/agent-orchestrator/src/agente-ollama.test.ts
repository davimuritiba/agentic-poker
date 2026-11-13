import { cartas } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import {
  contextoNoFlop,
  RECOMENDACAO_VALIDA,
  semente,
  visaoNoFlop,
} from './__testes__/fixtures.js';
import {
  ErroDoOllama,
  recomendarComOllama,
  type ChamarOllama,
  type MensagemOllama,
  type RespostaOllama,
} from './agente-ollama.js';
import { analisar } from './analise.js';
import { montarContexto } from './contexto.js';

const OPCOES = { simulacoes: 3_000, aleatorio: semente(11) };

const responde = (message: Partial<MensagemOllama>): RespostaOllama => ({
  message: { role: 'assistant', content: '', ...message },
  prompt_eval_count: 500,
  eval_count: 40,
});

/** Ollama simulado: devolve as respostas em sequência e guarda o que recebeu. */
function ollamaFalso(respostas: (RespostaOllama | Error)[]) {
  const corpos: Record<string, unknown>[] = [];
  const chamar: ChamarOllama = async (corpo) => {
    corpos.push(structuredClone(corpo));
    const r = respostas.shift();
    if (!r) throw new Error('sem mais respostas');
    if (r instanceof Error) throw r;
    return r;
  };
  return { chamar, corpos };
}

function preparar() {
  const c = contextoNoFlop();
  return { c, a: analisar(c, OPCOES) };
}

describe('agente com Ollama', () => {
  it('chama as ferramentas, depois entrega a recomendação em JSON estruturado', async () => {
    const { c, a } = preparar();
    const { chamar, corpos } = ollamaFalso([
      responde({
        tool_calls: [
          { function: { name: 'calcular_equity', arguments: { oponentes: 1 } } },
          { function: { name: 'avaliar_possibilidades', arguments: {} } },
        ],
      }),
      responde({ content: JSON.stringify(RECOMENDACAO_VALIDA) }),
    ]);

    const r = await recomendarComOllama(c, a, { ...OPCOES, chamar, modelo: 'qwen3:8b' });

    expect(r.recomendacao).toMatchObject({
      fonte: 'ia',
      modelo: 'qwen3:8b',
      acao: 'aumentar',
      valor: 150,
      alternativas: [{ acao: 'pagar', valor: 40 }],
      aviso: null,
    });
    expect(r.recomendacao.ferramentasUsadas).toEqual(['calcular_equity', 'avaliar_possibilidades']);
    expect(r.tokensDeEntrada).toBe(1000);

    // Com as duas ferramentas já usadas, vai direto à resposta final: só 2 chamadas.
    expect(corpos).toHaveLength(2);
    // 1ª chamada: com ferramentas, sem raciocínio estendido, saída curta e a mão descrita.
    expect(corpos[0]).toMatchObject({
      model: 'qwen3:8b',
      think: false,
      options: { num_predict: 96 },
    });
    expect(corpos[0]?.tools).toHaveLength(2);
    expect(JSON.stringify(corpos[0]?.messages)).toContain('Trinca de Ases');
    // Chamada final: leva os resultados das ferramentas e pede saída estruturada, sem ferramentas.
    const mensagens = corpos[1]?.messages as MensagemOllama[];
    const resultados = mensagens.filter((m) => m.role === 'tool');
    expect(resultados.map((m) => m.tool_name)).toEqual([
      'calcular_equity',
      'avaliar_possibilidades',
    ]);
    expect(resultados[0]?.content).toContain('equity_pct');
    expect(resultados[1]?.content).toContain('margem_em_pontos');
    expect(corpos[1]?.format).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['acao']),
    });
    expect(corpos[1]?.tools).toBeUndefined();
  });

  it('se o modelo pedir uma ferramenta por vez, continua até ter as duas', async () => {
    const { c, a } = preparar();
    const { chamar, corpos } = ollamaFalso([
      responde({
        tool_calls: [{ function: { name: 'calcular_equity', arguments: { oponentes: 1 } } }],
      }),
      responde({ tool_calls: [{ function: { name: 'avaliar_possibilidades', arguments: {} } }] }),
      responde({ content: JSON.stringify(RECOMENDACAO_VALIDA) }),
    ]);
    const r = await recomendarComOllama(c, a, { ...OPCOES, chamar, modelo: 'm' });
    expect(r.recomendacao.fonte).toBe('ia');
    expect(corpos).toHaveLength(3);
    expect(corpos[2]?.format).toBeDefined();
  });

  it('se o modelo não chamar ferramentas, os números entram mesmo assim', async () => {
    const { c, a } = preparar();
    const { chamar, corpos } = ollamaFalso([
      responde({ content: 'Vou direto.' }),
      responde({ content: JSON.stringify(RECOMENDACAO_VALIDA) }),
    ]);
    const r = await recomendarComOllama(c, a, { ...OPCOES, chamar, modelo: 'm' });

    expect(r.recomendacao.fonte).toBe('ia');
    expect(r.recomendacao.ferramentasUsadas).toEqual([]);
    expect(JSON.stringify(corpos[1]?.messages)).toContain('Resultado de avaliar_possibilidades');
  });

  it('aceita argumentos de ferramenta em texto JSON', async () => {
    const { c, a } = preparar();
    const { chamar, corpos } = ollamaFalso([
      responde({
        tool_calls: [{ function: { name: 'calcular_equity', arguments: '{"oponentes": 2}' } }],
      }),
      responde({}),
      responde({ content: JSON.stringify(RECOMENDACAO_VALIDA) }),
    ]);
    await recomendarComOllama(c, a, { ...OPCOES, chamar, modelo: 'm' });
    const resultado = (corpos[1]?.messages as MensagemOllama[]).find((m) => m.role === 'tool');
    expect(JSON.parse(resultado?.content ?? '{}')).toMatchObject({ oponentes: 2 });
  });

  it.each<[string, (RespostaOllama | Error)[], RegExp]>([
    ['JSON final inválido', [responde({}), responde({ content: 'não é json' })], /jogada inválida/],
    [
      'jogada não permitida',
      [
        responde({}),
        responde({ content: JSON.stringify({ ...RECOMENDACAO_VALIDA, acao: 'passar' }) }),
      ],
      /jogada inválida/,
    ],
    ['Ollama desligado', [new TypeError('fetch failed')], /não está rodando/],
    ['modelo não baixado', [new ErroDoOllama(404, 'model not found')], /ollama pull m/],
    ['demora', [Object.assign(new Error('timeout'), { name: 'TimeoutError' })], /demorou demais/],
  ])('%s: cai no coach por regras com o motivo', async (_nome, respostas, aviso) => {
    const { c, a } = preparar();
    const { chamar } = ollamaFalso(respostas);
    const r = await recomendarComOllama(c, a, { ...OPCOES, chamar, modelo: 'm' });
    expect(r.recomendacao.fonte).toBe('regras');
    expect(r.recomendacao.aviso).toMatch(aviso);
  });

  it('nunca envia ao modelo cartas de adversários, mesmo se viessem na visão', async () => {
    const vazada = visaoNoFlop();
    const montado = montarContexto({
      ...vazada,
      jogadores: vazada.jogadores.map((j) =>
        j.id === 'bot' ? { ...j, cartas: cartas('Kd Kc') } : j,
      ),
    });
    if (!montado.ok) throw new Error(montado.motivo);
    const c = montado.contexto;
    const { chamar, corpos } = ollamaFalso([
      responde({}),
      responde({ content: JSON.stringify(RECOMENDACAO_VALIDA) }),
    ]);
    await recomendarComOllama(c, analisar(c, OPCOES), { ...OPCOES, chamar, modelo: 'm' });

    const enviado = JSON.stringify(corpos);
    expect(enviado).toContain('As');
    expect(enviado).not.toContain('Kd');
    expect(enviado).not.toContain('Kc');
  });
});
