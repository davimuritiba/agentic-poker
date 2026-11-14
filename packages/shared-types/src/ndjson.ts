/**
 * NDJSON: um objeto JSON por linha. É o formato do streaming do Ollama e o que o
 * orquestrador usa para mandar o progresso ao game-engine. As linhas chegam em pedaços
 * arbitrários da rede; aqui elas são remontadas inteiras.
 */
export async function* lerLinhas(corpo: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decodificador = new TextDecoder();
  let resto = '';
  for await (const pedaco of corpo) {
    resto += decodificador.decode(pedaco, { stream: true });
    let fim = resto.indexOf('\n');
    while (fim >= 0) {
      const linha = resto.slice(0, fim).trim();
      resto = resto.slice(fim + 1);
      if (linha) yield linha;
      fim = resto.indexOf('\n');
    }
  }
  resto += decodificador.decode();
  if (resto.trim()) yield resto.trim();
}
