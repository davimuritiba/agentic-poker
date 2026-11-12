/**
 * Agent Orchestrator: microsserviço interno que hospeda os agentes de IA.
 * Só o game-engine fala com ele (escuta em 127.0.0.1), mandando a visão já filtrada
 * do jogador: o orquestrador nunca recebe cartas ocultas.
 *
 *   POST /coach/analise       → números imediatos (equity, pot odds, possibilidades)
 *   POST /coach/recomendacao  → recomendação do agente (Claude), ou por regras
 *   GET  /saude
 */
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { AnaliseDoCoach, VisaoDaMesa } from '@poker/shared-types';
import { recomendarComIA, type CriarMensagem } from './agente.js';
import { analisar } from './analise.js';
import { montarContexto, type ContextoDoJogador } from './contexto.js';

const PORTA = Number(process.env.AGENT_ORCHESTRATOR_PORT ?? 3002);
const MODELO = process.env.COACH_MODELO ?? 'claude-opus-5-5';
const LIMITE_DO_CORPO = 256 * 1024;

const { criar, motivoSemIA } = prepararIA();

function prepararIA(): { criar: CriarMensagem | null; motivoSemIA?: string } {
  if (process.env.COACH_IA === 'desligado')
    return { criar: null, motivoSemIA: 'IA desligada (COACH_IA=desligado).' };
  // O SDK só descobre a falta de credencial na hora da chamada; aqui checamos as fontes
  // que ele aceita (chave, token, perfil do `ant auth login`, federação de identidade).
  const temCredencial =
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_PROFILE ||
    process.env.ANTHROPIC_FEDERATION_RULE_ID ||
    existsSync(join(homedir(), '.config', 'anthropic'));
  if (!temCredencial) {
    return {
      criar: null,
      motivoSemIA:
        'IA não configurada: defina ANTHROPIC_API_KEY para ativar o agente. Usando o coach por regras.',
    };
  }
  const cliente = new Anthropic({ maxRetries: 1 });
  return { criar: (params, opcoes) => cliente.beta.messages.create(params, opcoes) };
}

const http = createServer((req, res) => {
  tratar(req, res).catch((erro: unknown) => {
    console.error('[agent-orchestrator] erro', erro);
    responder(res, 500, { motivo: 'Erro interno.' });
  });
});

/**
 * A mesma decisão (mesa, jogador, mão, momento) reaproveita a mesma análise: assim os
 * números da tela e os que o agente usa são idênticos, sem rodar o Monte Carlo duas vezes.
 */
const analisesRecentes = new Map<string, { analise: AnaliseDoCoach; expira: number }>();

function analiseDaDecisao(visao: VisaoDaMesa, contexto: ContextoDoJogador): AnaliseDoCoach {
  const agora = Date.now();
  for (const [chave, item] of analisesRecentes)
    if (item.expira < agora) analisesRecentes.delete(chave);

  const chave = `${visao.id}:${visao.voce?.id}:${contexto.numeroDaMao}:${contexto.momento}`;
  const guardada = analisesRecentes.get(chave);
  if (guardada) return guardada.analise;
  const analise = analisar(contexto);
  analisesRecentes.set(chave, { analise, expira: agora + 60_000 });
  return analise;
}

async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET' && req.url === '/saude') {
    return responder(res, 200, {
      servico: 'agent-orchestrator',
      ok: true,
      ia: criar ? MODELO : null,
    });
  }
  if (
    req.method !== 'POST' ||
    (req.url !== '/coach/analise' && req.url !== '/coach/recomendacao')
  ) {
    return responder(res, 404, { motivo: 'Rota não encontrada.' });
  }

  const corpo = await lerJson(req);
  const visao = (corpo as { visao?: VisaoDaMesa } | null)?.visao;
  if (!visao || !Array.isArray(visao.jogadores) || !Array.isArray(visao.eventos)) {
    return responder(res, 400, { motivo: 'Corpo deve ter { visao }.' });
  }
  const montado = montarContexto(visao);
  if (!montado.ok) return responder(res, 422, { motivo: montado.motivo });

  const inicio = Date.now();
  const analise = analiseDaDecisao(visao, montado.contexto);
  if (req.url === '/coach/analise') return responder(res, 200, analise);

  const r = await recomendarComIA(montado.contexto, analise, {
    criar,
    modelo: MODELO,
    motivoSemIA,
  });
  console.log(
    JSON.stringify({
      servico: 'agent-orchestrator',
      agente: 'coach',
      mao: analise.numeroDaMao,
      fonte: r.recomendacao.fonte,
      ferramentas: r.recomendacao.ferramentasUsadas,
      ms: Date.now() - inicio,
      tokens: { entrada: r.tokensDeEntrada, saida: r.tokensDeSaida },
      aviso: r.recomendacao.aviso,
    }),
  );
  return responder(res, 200, r.recomendacao);
}

async function lerJson(req: IncomingMessage): Promise<unknown> {
  let tamanho = 0;
  const partes: Buffer[] = [];
  for await (const parte of req) {
    tamanho += (parte as Buffer).length;
    if (tamanho > LIMITE_DO_CORPO) return null;
    partes.push(parte as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    return null;
  }
}

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

http.listen(PORTA, '127.0.0.1', () => {
  console.log(
    `[agent-orchestrator] ouvindo em http://127.0.0.1:${PORTA} · coach: ${criar ? `IA (${MODELO})` : 'regras'}`,
  );
});

const desligar = () => http.close();
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
