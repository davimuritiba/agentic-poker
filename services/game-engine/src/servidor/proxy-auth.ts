/**
 * Em produção (`pnpm start`) a interface é servida pelo game-engine, então ele repassa
 * /api/auth/* para o serviço auth. Em desenvolvimento quem faz isso é o Vite.
 */
import { request, type IncomingMessage, type ServerResponse } from 'node:http';

export function criarProxyDoAuth(urlDoAuth: string) {
  const destino = new URL(urlDoAuth);

  return (req: IncomingMessage, res: ServerResponse): void => {
    const pedido = request(
      {
        hostname: destino.hostname,
        port: destino.port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: destino.host,
          // Substitui (não acrescenta): o cliente não consegue forjar o próprio IP.
          'x-forwarded-for': req.socket.remoteAddress ?? '',
        },
        timeout: 10_000,
      },
      (resposta) => {
        res.writeHead(resposta.statusCode ?? 502, resposta.headers);
        resposta.pipe(res);
      },
    );
    pedido.on('timeout', () => pedido.destroy(new Error('timeout')));
    pedido.on('error', () => {
      if (res.headersSent) return void res.end();
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, motivo: 'Serviço de contas fora do ar.' }));
    });
    req.pipe(pedido);
  };
}
