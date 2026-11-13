/**
 * Serviço auth: contas de jogador (cadastro e login) guardadas no Postgres.
 * Emite o cookie de sessão que o game-engine confere ao abrir o WebSocket.
 *
 *   AUTH_PORT            porta (padrão 3003)
 *   DATABASE_URL         Postgres (padrão: o do docker-compose.yml)
 *   AUTH_SEGREDO         segredo da sessão, igual ao do game-engine (obrigatório em produção)
 *   AUTH_COOKIE_SEGURO   "1" para só enviar o cookie por HTTPS
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { segredoDaSessao } from '@poker/sessao';
import pg from 'pg';
import { ERRO_DE_JSON, criarApp, type Resultado } from './app.js';
import { UsuariosNoPostgres, migrar } from './postgres.js';

const PORTA = Number(process.env.AUTH_PORT ?? 3003);
const URL_DO_BANCO = process.env.DATABASE_URL ?? 'postgres://poker:poker@127.0.0.1:5433/poker';
const LIMITE_DO_CORPO = 16 * 1024;

const pool = new pg.Pool({ connectionString: URL_DO_BANCO, max: 10 });
pool.on('error', (erro) => console.error('[auth] erro no pool do Postgres', erro.message));

const tratar = criarApp({
  usuarios: new UsuariosNoPostgres(pool),
  segredo: segredoDaSessao(),
  cookieSeguro: process.env.AUTH_COOKIE_SEGURO === '1',
});

let bancoPronto = false;

async function prepararBanco(): Promise<void> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await migrar(pool);
      bancoPronto = true;
      console.log('[auth] banco de dados pronto');
      return;
    } catch (erro) {
      if (tentativa === 1) {
        console.error(
          `[auth] sem acesso ao Postgres (${(erro as Error).message}). ` +
            'Suba o banco com "pnpm db:up". Tentando de novo a cada 2s…',
        );
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

const http = createServer((req, res) => {
  atender(req, res).catch((erro: unknown) => {
    console.error('[auth] erro', erro);
    enviar(res, { status: 500, corpo: { ok: false, motivo: 'Erro interno.' } });
  });
});

async function atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caminho = new URL(req.url ?? '/', 'http://x').pathname;
  if (caminho === '/saude') {
    return enviar(res, {
      status: bancoPronto ? 200 : 503,
      corpo: { ok: bancoPronto, motivo: bancoPronto ? undefined : 'Banco indisponível.' },
    });
  }
  if (!bancoPronto) {
    return enviar(res, {
      status: 503,
      corpo: { ok: false, motivo: 'Serviço de contas iniciando. Tente de novo em instantes.' },
    });
  }

  const corpo = req.method === 'POST' ? await lerJson(req) : undefined;
  if (corpo === DEMAIS) {
    return enviar(res, { status: 413, corpo: { ok: false, motivo: 'Corpo grande demais.' } });
  }
  enviar(
    res,
    await tratar({
      metodo: req.method ?? 'GET',
      caminho,
      // Atrás do proxy (Vite ou game-engine) o IP real vem em x-forwarded-for.
      ip: String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
        .split(',')[0]!
        .trim(),
      cookie: req.headers.cookie,
      tipoDoConteudo: req.headers['content-type'],
      corpo,
    }),
  );
}

const DEMAIS = Symbol('corpo grande demais');

async function lerJson(req: IncomingMessage): Promise<unknown> {
  const pedacos: Buffer[] = [];
  let tamanho = 0;
  for await (const pedaco of req) {
    tamanho += (pedaco as Buffer).length;
    if (tamanho > LIMITE_DO_CORPO) return DEMAIS;
    pedacos.push(pedaco as Buffer);
  }
  const texto = Buffer.concat(pedacos).toString('utf8');
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return ERRO_DE_JSON;
  }
}

function enviar(res: ServerResponse, { status, corpo, cookie }: Resultado): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  });
  res.end(JSON.stringify(corpo));
}

http.listen(PORTA, '127.0.0.1', () => {
  console.log(`[auth] ouvindo em http://127.0.0.1:${PORTA}`);
  void prepararBanco();
});

function desligar(): void {
  http.close();
  void pool.end();
}
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
