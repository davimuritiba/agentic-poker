import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Usa o código-fonte do shared-types direto, sem precisar compilá-lo antes.
    alias: {
      '@poker/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // Em desenvolvimento, o Vite repassa o WebSocket ao servidor do jogo e /api/auth ao auth.
    proxy: {
      '/api/auth': {
        target: `http://127.0.0.1:${process.env.AUTH_PORT ?? 3003}`,
        xfwd: true,
      },
      '/socket.io': {
        target: `http://localhost:${process.env.GAME_ENGINE_PORT ?? 3001}`,
        ws: true,
      },
    },
  },
});
