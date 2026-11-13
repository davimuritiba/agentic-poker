import { randomInt } from 'node:crypto';

/**
 * Sorteia um inteiro em [0, limite). Recebe a fonte de aleatoriedade como parâmetro
 * para que os testes possam usar uma sequência previsível. Em produção, use sempre
 * `sortearSeguro`.
 */
export type Sorteador = (limite: number) => number;

/**
 * Sorteio com RNG criptográfico (`crypto.randomInt`), sem viés: cada valor em
 * [0, limite) tem exatamente a mesma chance. `Math.random` não serve aqui, porque
 * não é criptográfico e o estado interno dele pode ser previsto.
 */
export const sortearSeguro: Sorteador = (limite) => randomInt(limite);

/**
 * Embaralhamento de Fisher-Yates: cada uma das n! ordens possíveis tem a mesma chance,
 * desde que o sorteador seja uniforme.
 *
 * Percorre a lista de trás para frente e troca cada posição `i` com uma posição
 * sorteada entre 0 e `i` (inclusive). O erro clássico é sortear entre 0 e n-1 em
 * todas as posições, o que gera ordens com chances diferentes.
 *
 * Não altera a lista recebida: devolve uma cópia embaralhada.
 */
export function embaralhar<T>(itens: readonly T[], sortear: Sorteador = sortearSeguro): T[] {
  const resultado = [...itens];

  for (let i = resultado.length - 1; i > 0; i--) {
    const j = sortear(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(`Sorteador devolveu ${j}, fora do intervalo esperado [0, ${i}].`);
    }
    [resultado[i], resultado[j]] = [resultado[j] as T, resultado[i] as T];
  }

  return resultado;
}
