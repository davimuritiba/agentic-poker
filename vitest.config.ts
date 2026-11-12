import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Nos testes, cada @poker/<pacote> aponta para o código-fonte (src/index.ts),
// então não é preciso rodar o build antes de testar.
const packagesDir = fileURLToPath(new URL('./packages/', import.meta.url));
const alias = Object.fromEntries(
  readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => [`@poker/${entry.name}`, `${packagesDir}${entry.name}/src/index.ts`]),
);

export default defineConfig({
  resolve: { alias },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'services/*/src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
