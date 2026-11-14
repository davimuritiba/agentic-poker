/**
 * Leitura de JSON incompleto, para mostrar ao vivo o que a IA está escrevendo.
 *
 * A IA gera a resposta em JSON pedaço por pedaço, por exemplo:
 *   {"acao":"pagar","valor":null,"resumo":"Pague com 4
 * Este módulo "fecha" o que está aberto (a string, o objeto) e lê o resultado:
 *   { acao: 'pagar', valor: null, resumo: 'Pague com 4' }
 * Se o corte caiu no meio de algo que não dá para fechar (uma chave pela metade, `nu` de
 * `null`), descarta esse último pedaço e lê o que vem antes.
 */
export function lerJsonParcial(texto: string): Record<string, unknown> | null {
  const inicio = texto.indexOf('{');
  if (inicio < 0) return null;
  const corpo = texto.slice(inicio);

  // Primeira tentativa: fechar tudo como está. Se falhar, voltar até a última vírgula do
  // nível de fora (o último campo completo) e fechar dali.
  const tentativa = fechar(corpo);
  const lido = tentativa !== null ? tentarLer(tentativa) : null;
  if (lido) return lido;

  const corte = ultimaVirgulaDeFora(corpo);
  if (corte < 0) return tentarLer('{}');
  const recuado = fechar(corpo.slice(0, corte));
  return recuado !== null ? tentarLer(recuado) : null;
}

/** Fecha a string aberta e os objetos/listas abertos. Null se o texto não for consertável. */
function fechar(texto: string): string | null {
  const pilha: string[] = [];
  let emString = false;
  let escape = false;
  for (const ch of texto) {
    if (emString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') emString = false;
      continue;
    }
    if (ch === '"') emString = true;
    else if (ch === '{') pilha.push('}');
    else if (ch === '[') pilha.push(']');
    else if (ch === '}' || ch === ']') {
      if (pilha.pop() !== ch) return null;
    }
  }
  let resultado = texto;
  if (emString) {
    if (escape) resultado = resultado.slice(0, -1); // barra solta no fim da string
    resultado += '"';
  }
  // Uma vírgula pendurada antes do fechamento invalidaria o JSON.
  resultado = resultado.replace(/,\s*$/, '');
  return resultado + pilha.reverse().join('');
}

/** Posição da última vírgula fora de strings no primeiro nível do objeto, ou -1. */
function ultimaVirgulaDeFora(texto: string): number {
  let profundidade = 0;
  let emString = false;
  let escape = false;
  let ultima = -1;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (emString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') emString = false;
      continue;
    }
    if (ch === '"') emString = true;
    else if (ch === '{' || ch === '[') profundidade++;
    else if (ch === '}' || ch === ']') profundidade--;
    else if (ch === ',' && profundidade === 1) ultima = i;
  }
  return ultima;
}

function tentarLer(texto: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(texto);
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
