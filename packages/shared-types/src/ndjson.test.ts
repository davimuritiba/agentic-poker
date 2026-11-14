import { describe, expect, it } from 'vitest';
import { lerLinhas } from './ndjson.js';

/** Corpo de resposta que chega nos pedaços dados (como pela rede). */
function corpo(...pedacos: string[]): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  return new ReadableStream({
    start(controle) {
      for (const p of pedacos) controle.enqueue(codificador.encode(p));
      controle.close();
    },
  });
}

async function todas(stream: ReadableStream<Uint8Array>) {
  const linhas: string[] = [];
  for await (const linha of lerLinhas(stream)) linhas.push(linha);
  return linhas;
}

describe('lerLinhas', () => {
  it('remonta linhas cortadas em pedaços arbitrários', async () => {
    expect(await todas(corpo('{"a":', '1}\n{"b"', ':2}\n', '{"c":3}'))).toEqual([
      '{"a":1}',
      '{"b":2}',
      '{"c":3}',
    ]);
  });

  it('ignora linhas vazias e junta caracteres acentuados cortados no meio', async () => {
    const bytes = new TextEncoder().encode('{"t":"ação"}\n\n');
    const meio = 8; // corta dentro do "ç" (2 bytes em UTF-8)
    const stream = new ReadableStream<Uint8Array>({
      start(controle) {
        controle.enqueue(bytes.slice(0, meio));
        controle.enqueue(bytes.slice(meio));
        controle.close();
      },
    });
    expect(await todas(stream)).toEqual(['{"t":"ação"}']);
  });
});
