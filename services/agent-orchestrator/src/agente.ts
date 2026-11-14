/**
 * Agente coach com o Claude (API da Anthropic): recebe a situação que o jogador vê,
 * decide quais ferramentas usar e termina chamando `entregar_recomendacao`.
 *
 * Abordagem híbrida, como no documento do projeto: os números vêm de ferramentas
 * determinísticas (Monte Carlo, pot odds); o LLM escolhe o que calcular, interpreta e
 * explica. Qualquer falha cai no coach por regras.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AnaliseDoCoach, LeituraDoCoach } from '@poker/shared-types';
import type { OpcoesDeAnalise } from './analise.js';
import type { ContextoDoJogador } from './contexto.js';
import { lerPorRegras } from './regras.js';
import {
  ESQUEMA_DA_LEITURA,
  ESQUEMA_DA_RECOMENDACAO,
  FERRAMENTAS_DE_CALCULO,
  INSTRUCOES,
  converterLeitura,
  converterRecomendacao,
  descreverEtapa,
  executarFerramenta,
  pedidoDaLeitura,
  semIA,
  situacaoParaIA,
  type AoProgredir,
  type ResultadoDoAgente,
} from './ferramentas.js';

export type { ResultadoDoAgente } from './ferramentas.js';

type ParametrosDaMensagem = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Mensagem = Anthropic.Beta.Messages.BetaMessage;

/** Como o agente chama o Claude. Injetável para testar sem rede e sem custo. */
export type CriarMensagem = (
  params: ParametrosDaMensagem,
  opcoes: { signal: AbortSignal },
) => Promise<Mensagem>;

export interface OpcoesDoAgente extends OpcoesDeAnalise {
  /** null = IA indisponível: usa direto o coach por regras. */
  readonly criar: CriarMensagem | null;
  readonly modelo: string;
  readonly motivoSemIA?: string;
  /** Prazo total. Padrão: 25 s. */
  readonly sinal?: AbortSignal;
  readonly maxRodadas?: number;
  /** Recebe os passos do agente enquanto ele trabalha. */
  readonly aoProgredir?: AoProgredir;
}

const FERRAMENTAS: Anthropic.Beta.Messages.BetaTool[] = [
  ...FERRAMENTAS_DE_CALCULO.map((f) => ({
    name: f.nome,
    description: f.descricao,
    strict: true,
    input_schema: f.parametros as Anthropic.Beta.Messages.BetaTool.InputSchema,
  })),
  {
    name: 'entregar_recomendacao',
    description:
      'Entrega a recomendação final ao jogador. Chame uma única vez, depois de usar as outras ferramentas. ' +
      'A ação precisa ser uma das jogadas permitidas.',
    strict: true,
    input_schema:
      ESQUEMA_DA_RECOMENDACAO as unknown as Anthropic.Beta.Messages.BetaTool.InputSchema,
  },
];

const SISTEMA = `${INSTRUCOES}\n- Termine chamando entregar_recomendacao uma única vez.`;

export async function recomendarComIA(
  c: ContextoDoJogador,
  analise: AnaliseDoCoach,
  o: OpcoesDoAgente,
): Promise<ResultadoDoAgente> {
  if (!o.criar) return semIA(analise, o.motivoSemIA ?? 'IA desativada.');

  const sinal = o.sinal ?? AbortSignal.timeout(25_000);
  const mensagens: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: 'user', content: situacaoParaIA(c, analise) },
  ];
  const usadas: string[] = [];
  let entrada = 0;
  let saida = 0;
  // Passos do agente, ao vivo; o texto final do Claude chega de uma vez (a tela o digita).
  const etapas: string[] = ['Analisando a situação da mesa…'];
  o.aoProgredir?.({ etapas: [...etapas], texto: {} });

  try {
    for (let rodada = 0; rodada < (o.maxRodadas ?? 4); rodada++) {
      const resposta = await o.criar(
        {
          model: o.modelo,
          max_tokens: 8_000,
          system: SISTEMA,
          tools: FERRAMENTAS,
          messages: mensagens,
          output_config: { effort: 'low' },
          // Se o modelo recusar por política, a API tenta outro modelo na mesma chamada.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal: sinal },
      );
      entrada += resposta.usage.input_tokens;
      saida += resposta.usage.output_tokens;

      if (resposta.stop_reason === 'refusal') {
        return semIA(analise, 'A IA recusou a análise; usando o coach por regras.');
      }

      const usos = resposta.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use',
      );
      const final = usos.find((u) => u.name === 'entregar_recomendacao');
      if (final) {
        const recomendacao = converterRecomendacao(
          final.input,
          c,
          analise,
          [...usadas, 'entregar_recomendacao'],
          o.modelo,
        );
        if (!recomendacao) {
          return semIA(
            analise,
            'A IA sugeriu uma jogada que não é permitida; usando o coach por regras.',
          );
        }
        return { recomendacao, tokensDeEntrada: entrada, tokensDeSaida: saida };
      }
      if (usos.length === 0 || resposta.stop_reason === 'max_tokens') break;

      mensagens.push({ role: 'assistant', content: resposta.content });
      mensagens.push({
        role: 'user',
        content: usos.map((u) => {
          usadas.push(u.name);
          const r = executarFerramenta(u.name, u.input, c, analise, o);
          etapas.push(descreverEtapa(u.name, u.input, r, analise.perfil));
          o.aoProgredir?.({ etapas: [...etapas], texto: {} });
          return {
            type: 'tool_result' as const,
            tool_use_id: u.id,
            content: r.conteudo,
            ...(r.erro && { is_error: true }),
          };
        }),
      });
    }
    return semIA(analise, 'A IA não concluiu a recomendação; usando o coach por regras.');
  } catch (erro) {
    return semIA(analise, descreverErro(erro));
  }
}

/**
 * Leitura da mão em tempo real (fora da vez do jogador): uma chamada, sem ferramentas,
 * com saída estruturada pelo esquema da leitura.
 */
export async function lerComClaude(
  c: ContextoDoJogador,
  analise: AnaliseDoCoach,
  o: { criar: CriarMensagem; modelo: string; sinal?: AbortSignal },
): Promise<LeituraDoCoach> {
  try {
    const resposta = await o.criar(
      {
        model: o.modelo,
        max_tokens: 2_000,
        system: INSTRUCOES,
        messages: [{ role: 'user', content: pedidoDaLeitura(c, analise) }],
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: ESQUEMA_DA_LEITURA as unknown as Record<string, unknown>,
          },
        },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal: o.sinal ?? AbortSignal.timeout(20_000) },
    );
    if (resposta.stop_reason === 'refusal') {
      return lerPorRegras(analise, 'A IA recusou a leitura; leitura pelas regras.');
    }
    const textoDaResposta = resposta.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let json: unknown = null;
    try {
      json = JSON.parse(textoDaResposta);
    } catch {
      json = null;
    }
    return (
      converterLeitura(json, analise, o.modelo) ??
      lerPorRegras(analise, 'A IA respondeu fora do formato; leitura pelas regras.')
    );
  } catch (erro) {
    return lerPorRegras(analise, descreverErro(erro).replace('o coach por regras', 'as regras'));
  }
}

function descreverErro(erro: unknown): string {
  if (erro instanceof Anthropic.AuthenticationError)
    return 'Credencial da IA inválida; usando o coach por regras.';
  if (erro instanceof Anthropic.RateLimitError)
    return 'Limite de uso da IA atingido; usando o coach por regras.';
  if (
    erro instanceof Anthropic.APIUserAbortError ||
    erro instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return 'A IA demorou demais; usando o coach por regras.';
  }
  if (erro instanceof Anthropic.APIConnectionError)
    return 'Sem conexão com a IA; usando o coach por regras.';
  if (erro instanceof Anthropic.APIError)
    return `Erro da IA (${erro.status}); usando o coach por regras.`;
  if (erro instanceof Anthropic.AnthropicError)
    return 'IA mal configurada; usando o coach por regras.';
  if (erro instanceof Error && erro.name === 'TimeoutError')
    return 'A IA demorou demais; usando o coach por regras.';
  return 'Erro inesperado na IA; usando o coach por regras.';
}
