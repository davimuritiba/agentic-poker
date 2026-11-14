/**
 * Agent Orchestrator: microsserviço interno que hospeda os agentes de IA.
 * Só o game-engine fala com ele (escuta em 127.0.0.1), mandando a visão já filtrada
 * do jogador: o orquestrador nunca recebe cartas ocultas.
 *
 * Corpo de todas as rotas POST: { visao, perfil } (perfil: agressivo, equilibrado, seguro).
 *
 *   POST /coach/analise       → números imediatos (equity, pot odds, possibilidades)
 *   POST /coach/recomendacao  → na vez do jogador: recomendação do agente, ou por regras
 *   POST /coach/leitura       → a qualquer momento da mão: comentário curto da IA
 *                               (baixa prioridade: só usa a IA se ela estiver livre)
 *   GET  /saude
 *
 * Recomendação e leitura também podem vir AO VIVO: com o cabeçalho
 * `accept: application/x-ndjson`, a resposta chega em linhas, com os passos do agente e o
 * texto enquanto a IA escreve, e a resposta final na última linha.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  PERFIL_RECOMENDADO,
  ehPerfilDoCoach,
  type AnaliseDoCoach,
  type EscritaDoCoach,
  type LeituraDoCoach,
  type PerfilDoCoach,
  type RecomendacaoDoCoach,
  type VisaoDaMesa,
} from '@poker/shared-types';
import { analisar } from './analise.js';
import { montarContexto, type ContextoDoJogador } from './contexto.js';
import { FilaCheia, FilaDaIA } from './fila.js';
import { semIA, type AoProgredir } from './ferramentas.js';
import { escolherProvedor } from './provedor.js';
import { lerPorRegras } from './regras.js';

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
const leiturasRecentes = new Map<string, { leitura: Promise<LeituraDoCoach>; expira: number }>();
/** Leituras rodando na IA agora: uma decisão que chega interrompe todas. */
const leiturasEmCurso = new Set<AbortController>();

/** Identifica a decisão: mesa, jogador, mão, momento da mão e perfil escolhido. */
function chaveDaDecisao(visao: VisaoDaMesa, contexto: ContextoDoJogador, perfil: PerfilDoCoach) {
  return `${decisaoDoJogador(visao, contexto)}:${perfil}`;
}

/** A decisão em si, sem o perfil: o mesmo momento da mão para o mesmo jogador. */
function decisaoDoJogador(visao: VisaoDaMesa, contexto: ContextoDoJogador) {
  return `${visao.id}:${visao.voce?.id}:${contexto.numeroDaMao}:${contexto.momento}`;
}

/** A leitura muda só quando chega carta nova (ou com outro perfil). */
function chaveDaEtapa(visao: VisaoDaMesa, contexto: ContextoDoJogador, perfil: PerfilDoCoach) {
  const etapa = `${contexto.numeroDaMao}:${contexto.cartasNaMesa.length}:${contexto.oponentes.length}`;
  return `${visao.id}:${visao.voce?.id}:${etapa}:${perfil}`;
}

function limparVencidos(agora: number): void {
  for (const mapa of [analisesRecentes, recomendacoesRecentes, leiturasRecentes]) {
    for (const [chave, item] of mapa) if (item.expira < agora) mapa.delete(chave);
  }
}

function analiseDaDecisao(
  chave: string,
  contexto: ContextoDoJogador,
  perfil: PerfilDoCoach,
): AnaliseDoCoach {
  const guardada = analisesRecentes.get(chave);
  if (guardada) return guardada.analise;
  const analise = analisar(contexto, {}, perfil);
  analisesRecentes.set(chave, { analise, expira: Date.now() + VALIDADE_MS });
  return analise;
}

// ---------- Escrita ao vivo ----------

/**
 * Canal de progresso de cada decisão/leitura em andamento: guarda o último estado (para
 * quem chega depois) e avisa quem está ouvindo (as respostas em streaming).
 */
const canais = new Map<
  string,
  { ultimo: EscritaDoCoach | null; ouvintes: Set<(escrita: EscritaDoCoach) => void> }
>();

function canal(chave: string) {
  let c = canais.get(chave);
  if (!c) canais.set(chave, (c = { ultimo: null, ouvintes: new Set() }));
  return c;
}

/** Transforma o progresso do agente na mensagem que vai até a tela do jogador. */
function publicador(chave: string, analise: AnaliseDoCoach): AoProgredir {
  return ({ etapas, texto }) => {
    const escrita: EscritaDoCoach = {
      modo: analise.modo,
      numeroDaMao: analise.numeroDaMao,
      momento: analise.momento,
      cartasNaMesa: analise.cartasNaMesa,
      perfil: analise.perfil,
      etapas,
      texto,
    };
    const c = canal(chave);
    c.ultimo = escrita;
    for (const ouvir of c.ouvintes) ouvir(escrita);
  };
}

/**
 * Responde em NDJSON: uma linha `{"tipo":"escrita",...}` a cada progresso e, no fim,
 * `{"tipo":"final","dados":...}` com a resposta validada.
 */
async function responderAoVivo<T>(
  req: IncomingMessage,
  res: ServerResponse,
  chave: string,
  resultado: Promise<T>,
): Promise<void> {
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
  const escrever = (linha: unknown) => res.write(`${JSON.stringify(linha)}\n`);
  const c = canal(chave);
  const ouvir = (escrita: EscritaDoCoach) => escrever({ tipo: 'escrita', escrita });
  if (c.ultimo) ouvir(c.ultimo);
  c.ouvintes.add(ouvir);
  req.on('close', () => c.ouvintes.delete(ouvir));
  try {
    escrever({ tipo: 'final', dados: await resultado });
  } finally {
    c.ouvintes.delete(ouvir);
    res.end();
  }
}

const querAoVivo = (req: IncomingMessage) =>
  (req.headers.accept ?? '').includes('application/x-ndjson');

function leituraDaEtapa(
  chave: string,
  contexto: ContextoDoJogador,
  analise: AnaliseDoCoach,
): Promise<LeituraDoCoach> {
  const guardada = leiturasRecentes.get(chave);
  if (guardada) return guardada.leitura;
  const inicio = Date.now();
  // Uma decisão que chegar interrompe esta leitura (ver gerarRecomendacao).
  const interromper = new AbortController();
  leiturasEmCurso.add(interromper);
  const sinal = AbortSignal.any([interromper.signal, AbortSignal.timeout(PRAZO_MS)]);
  const aoProgredir = publicador(chave, analise);
  const leitura = fila
    .executarSeLivre(() => provedor.ler(contexto, analise, sinal, aoProgredir))
    .then((l) => {
      if (!interromper.signal.aborted) return l;
      leiturasRecentes.delete(chave); // não guarda: pode ser pedida de novo depois
      return lerPorRegras(
        analise,
        'A leitura da IA foi interrompida para dar prioridade a uma decisão; leitura pelas regras.',
      );
    })
    .catch((erro: unknown) =>
      lerPorRegras(
        analise,
        erro instanceof FilaCheia
          ? 'A IA está ocupada com decisões de jogadores; leitura pelas regras.'
          : 'A IA não respondeu a tempo; leitura pelas regras.',
      ),
    )
    .finally(() => {
      leiturasEmCurso.delete(interromper);
      canais.delete(chave);
    })
    .then((l) => {
      console.log(
        JSON.stringify({
          servico: 'agent-orchestrator',
          agente: 'coach-leitura',
          provedor: provedor.nome,
          mao: analise.numeroDaMao,
          etapa: analise.fase,
          perfil: analise.perfil,
          fonte: l.fonte,
          ms: Date.now() - inicio,
          aviso: l.aviso,
        }),
      );
      return l;
    });
  leiturasRecentes.set(chave, { leitura, expira: Date.now() + VALIDADE_MS });
  return leitura;
}

/**
 * Decisão em andamento por jogador (mesa, jogador, mão, momento — sem o perfil). Se o
 * jogador troca de perfil no meio da decisão, a análise do perfil antigo é cancelada e
 * libera a IA na hora, em vez de ocupar a vez dele por mais uns 13 s.
 */
const decisoesEmCurso = new Map<string, { chave: string; cancelar: AbortController }>();

function recomendacaoDaDecisao(
  chave: string,
  decisao: string,
  contexto: ContextoDoJogador,
  analise: AnaliseDoCoach,
): Promise<RecomendacaoDoCoach> {
  const guardada = recomendacoesRecentes.get(chave);
  if (guardada) return guardada.recomendacao;

  const anterior = decisoesEmCurso.get(decisao);
  if (anterior && anterior.chave !== chave) {
    anterior.cancelar.abort();
    recomendacoesRecentes.delete(anterior.chave);
  }
  const cancelar = new AbortController();
  decisoesEmCurso.set(decisao, { chave, cancelar });
  const recomendacao = gerarRecomendacao(
    contexto,
    analise,
    cancelar.signal,
    publicador(chave, analise),
  ).finally(() => {
    if (decisoesEmCurso.get(decisao)?.cancelar === cancelar) decisoesEmCurso.delete(decisao);
    canais.delete(chave);
  });
  recomendacoesRecentes.set(chave, { recomendacao, expira: Date.now() + VALIDADE_MS });
  return recomendacao;
}

async function gerarRecomendacao(
  contexto: ContextoDoJogador,
  analise: AnaliseDoCoach,
  cancelada: AbortSignal,
  aoProgredir: AoProgredir,
): Promise<RecomendacaoDoCoach> {
  const inicio = Date.now();
  // O prazo conta o tempo na fila também.
  const sinal = AbortSignal.any([cancelada, AbortSignal.timeout(PRAZO_MS)]);
  // Decisão tem prioridade: leituras em andamento são interrompidas e liberam a IA.
  for (const leitura of leiturasEmCurso) leitura.abort();
  if (fila.emAndamento > 0) {
    aoProgredir({ etapas: ['Na fila: o coach está atendendo outro jogador…'], texto: {} });
  }
  const r = await fila
    .executar(() => provedor.recomendar(contexto, analise, sinal, aoProgredir), sinal)
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
      perfil: analise.perfil,
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
  const rotas = ['/coach/analise', '/coach/recomendacao', '/coach/leitura'];
  if (req.method !== 'POST' || !rotas.includes(req.url ?? '')) {
    return responder(res, 404, { motivo: 'Rota não encontrada.' });
  }

  const corpo = (await lerJson(req)) as { visao?: VisaoDaMesa; perfil?: unknown } | null;
  const visao = corpo?.visao;
  if (!visao || !Array.isArray(visao.jogadores) || !Array.isArray(visao.eventos)) {
    return responder(res, 400, { motivo: 'Corpo deve ter { visao }.' });
  }
  const perfil = ehPerfilDoCoach(corpo?.perfil) ? corpo.perfil : PERFIL_RECOMENDADO;
  // Só a recomendação de jogada exige a vez do jogador; números e leitura valem a mão toda.
  const montado = montarContexto(visao, { exigirVez: req.url === '/coach/recomendacao' });
  if (!montado.ok) return responder(res, 422, { motivo: montado.motivo });
  const { contexto } = montado;

  limparVencidos(Date.now());
  const chave = chaveDaDecisao(visao, contexto, perfil);
  const analise = analiseDaDecisao(chave, contexto, perfil);
  switch (req.url) {
    case '/coach/analise':
      return responder(res, 200, analise);
    case '/coach/leitura': {
      const chaveDaLeitura = chaveDaEtapa(visao, contexto, perfil);
      const leitura = leituraDaEtapa(chaveDaLeitura, contexto, analise);
      if (querAoVivo(req)) return responderAoVivo(req, res, chaveDaLeitura, leitura);
      return responder(res, 200, await leitura);
    }
    default: {
      const decisao = decisaoDoJogador(visao, contexto);
      const recomendacao = recomendacaoDaDecisao(chave, decisao, contexto, analise);
      if (querAoVivo(req)) return responderAoVivo(req, res, chave, recomendacao);
      return responder(res, 200, await recomendacao);
    }
  }
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
