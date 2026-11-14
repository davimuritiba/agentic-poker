/**
 * Escolhe qual IA o coach usa, a partir das variáveis de ambiente (ou do .env):
 *
 *   COACH_PROVEDOR=ollama   modelo local no servidor (padrão sem chave da Anthropic)
 *   COACH_PROVEDOR=claude   API da Anthropic (padrão quando há credencial)
 *   COACH_PROVEDOR=regras   sem IA: só o coach por regras
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { AnaliseDoCoach, LeituraDoCoach } from '@poker/shared-types';
import { lerComClaude, recomendarComIA, type CriarMensagem } from './agente.js';
import { clienteOllama, lerComOllama, recomendarComOllama } from './agente-ollama.js';
import type { ContextoDoJogador } from './contexto.js';
import { semIA, type AoProgredir, type ResultadoDoAgente } from './ferramentas.js';
import { lerPorRegras } from './regras.js';

export interface Provedor {
  readonly nome: 'ollama' | 'claude' | 'regras';
  readonly modelo: string | null;
  /** Quantos pedidos à IA podem rodar ao mesmo tempo. */
  readonly concorrencia: number;
  /** `aoProgredir` recebe, ao vivo, os passos do agente e o texto sendo escrito. */
  recomendar(
    c: ContextoDoJogador,
    analise: AnaliseDoCoach,
    sinal: AbortSignal,
    aoProgredir?: AoProgredir,
  ): Promise<ResultadoDoAgente>;
  /** Comentário curto sobre a mão, fora da vez do jogador. */
  ler(
    c: ContextoDoJogador,
    analise: AnaliseDoCoach,
    sinal: AbortSignal,
    aoProgredir?: AoProgredir,
  ): Promise<LeituraDoCoach>;
  /** Situação da IA, para /saude e para o aviso ao subir o serviço. */
  verificar(): Promise<Record<string, unknown>>;
}

type Ambiente = Record<string, string | undefined>;

export function escolherProvedor(env: Ambiente = process.env): Provedor {
  const pedido = env.COACH_PROVEDOR ?? (env.COACH_IA === 'desligado' ? 'regras' : undefined);
  const nome = pedido ?? (temCredencialAnthropic(env) ? 'claude' : 'ollama');
  const concorrenciaPedida = Number(env.COACH_CONCORRENCIA);
  const concorrencia = (padrao: number) =>
    Number.isInteger(concorrenciaPedida) && concorrenciaPedida > 0 ? concorrenciaPedida : padrao;

  switch (nome) {
    case 'ollama':
      return provedorOllama(env, concorrencia(1));
    case 'claude':
      return provedorClaude(env, concorrencia(4));
    case 'regras':
      return provedorRegras('IA desligada (COACH_PROVEDOR=regras).');
    default:
      return provedorRegras(
        `COACH_PROVEDOR desconhecido: "${nome}". Use ollama, claude ou regras.`,
      );
  }
}

function provedorOllama(env: Ambiente, concorrencia: number): Provedor {
  const url = (env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const modelo = env.COACH_MODELO ?? 'qwen3:8b';
  const chamar = clienteOllama(url);
  return {
    nome: 'ollama',
    modelo,
    concorrencia,
    recomendar: (c, analise, sinal, aoProgredir) =>
      recomendarComOllama(c, analise, { chamar, modelo, sinal, aoProgredir }),
    ler: (c, analise, sinal, aoProgredir) =>
      lerComOllama(c, analise, { chamar, modelo, sinal, aoProgredir }),
    async verificar() {
      try {
        const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2_000) });
        const { models = [] } = (await r.json()) as { models?: { name: string }[] };
        const nomes = models.map((m) => m.name);
        const baixado = nomes.includes(modelo) || nomes.includes(`${modelo}:latest`);
        return {
          ollama: 'rodando',
          modeloBaixado: baixado,
          ...(!baixado && { dica: `rode: ollama pull ${modelo}` }),
        };
      } catch {
        return { ollama: 'fora do ar', dica: `inicie o Ollama em ${url} (ollama serve)` };
      }
    },
  };
}

function provedorClaude(env: Ambiente, concorrencia: number): Provedor {
  const modelo = env.COACH_MODELO ?? 'claude-opus-5-5';
  if (!temCredencialAnthropic(env)) {
    return provedorRegras(
      'IA não configurada: defina ANTHROPIC_API_KEY no .env para usar o Claude.',
    );
  }
  const cliente = new Anthropic({ maxRetries: 1 });
  const criar: CriarMensagem = (params, opcoes) => cliente.beta.messages.create(params, opcoes);
  return {
    nome: 'claude',
    modelo,
    concorrencia,
    recomendar: (c, analise, sinal, aoProgredir) =>
      recomendarComIA(c, analise, { criar, modelo, sinal, aoProgredir }),
    ler: (c, analise, sinal) => lerComClaude(c, analise, { criar, modelo, sinal }),
    verificar: async () => ({ claude: 'configurado' }),
  };
}

function provedorRegras(motivo: string): Provedor {
  return {
    nome: 'regras',
    modelo: null,
    concorrencia: 64,
    recomendar: async (_c, analise) => semIA(analise, motivo),
    ler: async (_c, analise) => lerPorRegras(analise, motivo),
    verificar: async () => ({ motivo }),
  };
}

/** O SDK só descobre a falta de credencial na hora da chamada; checamos as fontes que ele aceita. */
function temCredencialAnthropic(env: Ambiente): boolean {
  return Boolean(
    env.ANTHROPIC_API_KEY ||
    env.ANTHROPIC_AUTH_TOKEN ||
    env.ANTHROPIC_PROFILE ||
    env.ANTHROPIC_FEDERATION_RULE_ID ||
    existsSync(join(homedir(), '.config', 'anthropic')),
  );
}
