/**
 * Quantidade de fichas virtuais.
 *
 * Regra do projeto: fichas são sempre números inteiros e nunca negativos. Nada de
 * decimais. Assim a divisão de potes e o ledger da Wallet não sofrem com erros de
 * arredondamento. Quando um pote não divide exato entre vencedores, a ficha que sobra
 * é tratada por regra explícita no Game Engine, nunca por fração.
 */
export type Fichas = number;

export function ehQuantidadeDeFichasValida(valor: number): valor is Fichas {
  return Number.isSafeInteger(valor) && valor >= 0;
}
