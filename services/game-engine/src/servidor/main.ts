/**
 * Servidor de tempo real: recebe jogadores por WebSocket (Socket.IO), repassa os comandos
 * para as mesas e envia a cada jogador a SUA visão da mesa sempre que algo muda.
 *
 *   cliente ──"mesa:acao"──▶ servidor ──▶ MesaAoVivo.agir ──▶ motor (aplicarAcao)
 *   cliente ◀─"mesa:estado"── servidor ◀── aoMudar (visão personalizada por jogador)
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { segredoDaSessao } from '@poker/sessao';
import type {
  EventosDoCliente,
  EventosDoServidor,
  Identificacao,
  Resposta,
} from '@poker/shared-types';
import { Server, type Socket } from 'socket.io';
import { LimiteDoCoach, pedirAnalise, pedirRecomendacao } from './coach.js';
import { identificacaoDoCookie, lerAcao } from './entrada.js';
import { criarServidorDeEstaticos } from './estaticos.js';
import { Lobby } from './lobby.js';
import { criarProxyDoAuth } from './proxy-auth.js';

interface DadosDoSocket extends Identificacao {
  mesaId: string | null;
}
type Conexao = Socket<EventosDoCliente, EventosDoServidor, Record<string, never>, DadosDoSocket>;

// Nome próprio (e não PORT) para não colidir com ferramentas que definem PORT para o Vite.
const PORTA = Number(process.env.GAME_ENGINE_PORT ?? 3001);
const SEGREDO_DA_SESSAO = segredoDaSessao();
const URL_DO_AUTH = process.env.AUTH_URL ?? 'http://127.0.0.1:3003';
const PASTA_WEB = fileURLToPath(new URL('../../../../apps/web/dist', import.meta.url));

const conexoesPorMesa = new Map<string, Set<Conexao>>();
const limiteDoCoach = new LimiteDoCoach();
const mesasParaAtualizar = new Set<string>();

const lobby = new Lobby((mesaId) => {
  // Junta várias mudanças seguidas num envio só.
  if (mesasParaAtualizar.size === 0) queueMicrotask(enviarAtualizacoes);
  mesasParaAtualizar.add(mesaId);
});

function enviarAtualizacoes(): void {
  for (const mesaId of mesasParaAtualizar) {
    const mesa = lobby.mesa(mesaId);
    for (const conexao of conexoesPorMesa.get(mesaId) ?? []) {
      conexao.emit('mesa:estado', mesa?.visao(conexao.data.jogadorId) ?? null);
    }
  }
  mesasParaAtualizar.clear();
  io.emit('lobby:mesas', lobby.resumos());
}

const servirEstaticos = criarServidorDeEstaticos(PASTA_WEB);
const repassarAoAuth = criarProxyDoAuth(URL_DO_AUTH);
const http = createServer((req, res) => {
  if (req.url?.startsWith('/api/auth/')) return repassarAoAuth(req, res);
  if (req.url === '/saude') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ servico: 'game-engine', ok: true }));
    return;
  }
  servirEstaticos(req, res).catch(() => res.writeHead(500).end());
});

const io = new Server<EventosDoCliente, EventosDoServidor, Record<string, never>, DadosDoSocket>(
  http,
);

// Só entra quem tem sessão válida (cookie emitido pelo serviço auth no login).
io.use((conexao, seguir) => {
  const identificacao = identificacaoDoCookie(conexao.handshake.headers.cookie, SEGREDO_DA_SESSAO);
  if (!identificacao) return seguir(new Error('nao-autenticado'));
  conexao.data = { ...identificacao, mesaId: null };
  seguir();
});

io.on('connection', (conexao: Conexao) => {
  conexao.emit('lobby:mesas', lobby.resumos());

  /** Garante que `responder` existe e é função (o cliente pode omitir). */
  const comResposta =
    <A extends unknown[]>(tratar: (...args: A) => Resposta) =>
    (...args: [...A, unknown]) => {
      const responder = args.at(-1);
      const resposta = tratar(...(args.slice(0, -1) as A));
      if (typeof responder === 'function') responder(resposta);
    };

  conexao.on(
    'mesa:entrar',
    comResposta((dados: unknown) => {
      const mesaId = (dados as { mesaId?: unknown } | null)?.mesaId;
      const mesa = typeof mesaId === 'string' ? lobby.mesa(mesaId) : undefined;
      if (!mesa) return { ok: false, motivo: 'Mesa não encontrada.' };

      sairDaMesaAtual(conexao);
      const resposta = mesa.sentar(conexao.data.jogadorId, conexao.data.nome);
      if (!resposta.ok) return resposta;
      conexao.data.mesaId = mesa.id;
      conexoesDa(mesa.id).add(conexao);
      conexao.emit('mesa:estado', mesa.visao(conexao.data.jogadorId));
      return { ok: true };
    }),
  );

  conexao.on(
    'mesa:sair',
    comResposta(() => {
      sairDaMesaAtual(conexao);
      conexao.emit('mesa:estado', null);
      return { ok: true };
    }),
  );

  conexao.on(
    'mesa:adicionar-bot',
    comResposta(() => {
      const mesa = mesaDa(conexao);
      return mesa ? mesa.adicionarBot() : { ok: false, motivo: 'Entre em uma mesa primeiro.' };
    }),
  );

  conexao.on(
    'mesa:acao',
    comResposta((dado: unknown) => {
      const mesa = mesaDa(conexao);
      if (!mesa) return { ok: false, motivo: 'Entre em uma mesa primeiro.' };
      const acao = lerAcao(dado);
      if (!acao) return { ok: false, motivo: 'Ação em formato inválido.' };
      return mesa.agir(conexao.data.jogadorId, acao);
    }),
  );

  // Coach IA: os números chegam rápido (coach:analise); a recomendação do agente,
  // que leva alguns segundos, chega depois (coach:recomendacao).
  conexao.on('coach:pedir', async (responder: unknown) => {
    const responda = (r: Resposta) => {
      if (typeof responder === 'function') responder(r);
    };
    const mesa = mesaDa(conexao);
    if (!mesa) return responda({ ok: false, motivo: 'Entre em uma mesa primeiro.' });
    const jogadorId = conexao.data.jogadorId;
    const visao = mesa.visao(jogadorId); // a mesma visão filtrada que o jogador vê
    if (!visao.voce?.acoes) {
      return responda({ ok: false, motivo: 'O coach analisa a sua jogada quando for a sua vez.' });
    }
    const bloqueio = limiteDoCoach.tentarComecar(jogadorId);
    if (bloqueio) return responda({ ok: false, motivo: bloqueio });

    try {
      const analise = await pedirAnalise(visao);
      if (!analise.ok) return responda(analise);
      conexao.emit('coach:analise', analise.dados);
      responda({ ok: true });

      const recomendacao = await pedirRecomendacao(visao);
      if (recomendacao.ok) conexao.emit('coach:recomendacao', recomendacao.dados);
    } finally {
      limiteDoCoach.terminar(jogadorId);
    }
  });

  conexao.on('disconnect', () => {
    const mesa = mesaDa(conexao);
    if (!mesa) return;
    conexoesDa(mesa.id).delete(conexao);
    // Continua sentado: se voltar a tempo, segue jogando. Senão, o tempo esgota.
    if (!temOutraConexao(mesa.id, conexao.data.jogadorId)) {
      mesa.definirConexao(conexao.data.jogadorId, false);
    }
  });
});

function conexoesDa(mesaId: string): Set<Conexao> {
  let conjunto = conexoesPorMesa.get(mesaId);
  if (!conjunto) conexoesPorMesa.set(mesaId, (conjunto = new Set()));
  return conjunto;
}

function mesaDa(conexao: Conexao) {
  return conexao.data.mesaId ? lobby.mesa(conexao.data.mesaId) : undefined;
}

function temOutraConexao(mesaId: string, jogadorId: string): boolean {
  return [...conexoesDa(mesaId)].some((c) => c.data.jogadorId === jogadorId);
}

function sairDaMesaAtual(conexao: Conexao): void {
  const mesa = mesaDa(conexao);
  if (!mesa) return;
  conexoesDa(mesa.id).delete(conexao);
  conexao.data.mesaId = null;
  if (!temOutraConexao(mesa.id, conexao.data.jogadorId)) mesa.levantar(conexao.data.jogadorId);
}

http.listen(PORTA, () => {
  console.log(`[game-engine] ouvindo em http://localhost:${PORTA}`);
});

function desligar(): void {
  lobby.encerrar();
  io.close();
  http.close();
}
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
