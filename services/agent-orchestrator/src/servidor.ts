/**
 * Agent Orchestrator: microsserviço interno que hospeda os agentes de IA.
 * Só o game-engine fala com ele (escuta em 127.0.0.1), mandando a visão já filtrada
 * do jogador: o orquestrador nunca recebe cartas ocultas.
 *
 *   POST /coach/analise       → números imediatos (equity, pot odds, possibilidades)
 *   POST /coach/recomendacao  → recomendação do agente (Ollama ou Claude), ou por regras
 *   GET  /saude
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AnaliseDoCoach, RecomendacaoDoCoach, VisaoDaMesa } from '@poker/shared-types';
import { analisar } from './analise.js';
import { montarContexto, type ContextoDoJogador } from './contexto.js';
import { FilaCheia, FilaDaIA } from './fila.js';
import { semIA } from './ferramentas.js';
import { escolherProvedor } from './provedor.js';

const PORTA = Number(process.env.AGENT_ORCHESTRATOR_PORT ?? 3002);
const PRAZO_MS = Number(process.env.COACH_PRAZO_MS ?? 25_000);
const LIMITE_DO_CORPO = 256 * 1024;
const VALIDADE_MS = 60_000;

const provedor = escolherProvedor();
const fila = new FilaDaIA(provedor.concorrencia, Number(process.env.COACH_FILA_MAX ?? 4));

/**
 * A mesma decisão (mesa, jogador, mão, momento) reaproveita a mesma análise e a mesma
 * recomendação: os números da tela e os do agente são idênticos, e pedir de novo não
 * gasta a IA outra vez.
 */
const analisesRecentes = new Map<string, { analise: AnaliseDoCoach; expira: number }>();
const recomendacoesRecentes = new Map<
  string,
  { recomendacao: Promise<RecomendacaoDoCoach>; expira: number }
>();

function chaveDaDecisao(visao: VisaoDaMesa, contexto: ContextoDoJogador): string {
  return `${visao.id}:${visao.voce?.id}:${contexto.numeroDaMao}:${contexto.momento}`;
}

function limparVencidos(agora: number): void {
  for (const mapa of [analisesRecentes, recomendacoesRecentes]) {
    for (const [chave, item] of mapa) if (item.expira < agora) mapa.delete(chave);
  }
}

function analiseDaDecisao(chave: string, contexto: ContextoDoJogador): AnaliseDoCoach {
  const guardada = analisesRecentes.get(chave);
  if (guardada) return guardada.analise;
  const analise = analisar(contexto);
  analisesRecentes.set(chave, { analise, expira: Date.now() + VALIDADE_MS });
  return analise;
}

function recomendacaoDaDecisao(
  chave: string,
  contexto: ContextoDoJogador,
  analise: AnaliseDoCoach,
): Promise<RecomendacaoDoCoach> {
  const guardada = recomendacoesRecentes.get(chave);
  if (guardada) return guardada.recomendacao;
  const recomendacao = gerarRecomendacao(contexto, analise);
  recomendacoesRecentes.set(chave, { recomendacao, expira: Date.now() + VALIDADE_MS });
  return recomendacao;
}

async function gerarRecomendacao(
  contexto: ContextoDoJogador,
  analise: AnaliseDoCoach,
): Promise<RecomendacaoDoCoach> {
  const inicio = Date.now();
  const sinal = AbortSignal.timeout(PRAZO_MS); // conta o tempo na fila também
  const r = await fila
    .executar(() => provedor.recomendar(contexto, analise, sinal), sinal)
    .catch((erro: unknown) =>
      semIA(
        analise,
        erro instanceof FilaCheia
          ? 'O Coach IA está ocupado com outros jogadores; usando o coach por regras.'
          : 'O Coach IA demorou demais; usando o coach por regras.',
      ),
    );
  console.log(
    JSON.stringify({
      servico: 'agent-orchestrator',
      agente: 'coach',
      provedor: provedor.nome,
      modelo: r.recomendacao.modelo,
      mao: analise.numeroDaMao,
      fonte: r.recomendacao.fonte,
      ferramentas: r.recomendacao.ferramentasUsadas,
      ms: Date.now() - inicio,
      tokens: { entrada: r.tokensDeEntrada, saida: r.tokensDeSaida },
      fila: { emAndamento: fila.emAndamento, esperando: fila.naFila },
      aviso: r.recomendacao.aviso,
    }),
  );
  return r.recomendacao;
}

const http = createServer((req, res) => {
  tratar(req, res).catch((erro: unknown) => {
    console.error('[agent-orchestrator] erro', erro);
    responder(res, 500, { motivo: 'Erro interno.' });
  });
});

async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET' && req.url === '/saude') {
    return responder(res, 200, {
      servico: 'agent-orchestrator',
      ok: true,
      provedor: provedor.nome,
      modelo: provedor.modelo,
      fila: {
        emAndamento: fila.emAndamento,
        esperando: fila.naFila,
        limite: provedor.concorrencia,
      },
      ...(await provedor.verificar()),
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

  limparVencidos(Date.now());
  const chave = chaveDaDecisao(visao, montado.contexto);
  const analise = analiseDaDecisao(chave, montado.contexto);
  if (req.url === '/coach/analise') return responder(res, 200, analise);
  return responder(res, 200, await recomendacaoDaDecisao(chave, montado.contexto, analise));
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
  const descricao = provedor.modelo ? `${provedor.nome} (${provedor.modelo})` : provedor.nome;
  console.log(`[agent-orchestrator] ouvindo em http://127.0.0.1:${PORTA} · coach: ${descricao}`);
  void provedor.verificar().then((situacao) => {
    if (situacao.dica) console.warn(`[agent-orchestrator] atenção: ${String(situacao.dica)}`);
  });
});

const desligar = () => http.close();
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
