/**
 * Serve a interface web já compilada (apps/web/dist), para jogar sem o servidor de
 * desenvolvimento do Vite. Em desenvolvimento quem serve a interface é o Vite.
 */
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

export function criarServidorDeEstaticos(pasta: string) {
  const disponivel = existsSync(join(pasta, 'index.html'));

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!disponivel) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(
        'Interface não compilada. Use "pnpm dev" ou rode "pnpm build" antes de "pnpm start".',
      );
      return;
    }

    const caminhoPedido = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let arquivo = normalize(join(pasta, caminhoPedido));
    // Impede "../" de escapar da pasta.
    if (arquivo !== pasta && !arquivo.startsWith(pasta + sep)) {
      res.writeHead(403).end();
      return;
    }
    const info = await stat(arquivo).catch(() => null);
    if (!info?.isFile()) arquivo = join(pasta, 'index.html');

    const conteudo = await readFile(arquivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(conteudo);
  };
}
