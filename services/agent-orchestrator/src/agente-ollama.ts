/**
 * Agente coach com um modelo local, servido pelo Ollama na mesma máquina do servidor.
 * Grátis, sem chave e sem enviar nada para fora.
 *
 * Modelos locais pequenos seguem formatos com menos precisão que o Claude, então o agente
 * trabalha em duas fases:
 *   1. o modelo chama as ferramentas de cálculo quantas vezes quiser (parte agêntica);
 *   2. a recomendação final vem em saída estruturada: o Ollama força o JSON a seguir o
 *      esquema, e a resposta ainda passa pela mesma validação do agente com Claude.
 */
import type { AnaliseDoCoach } from '@poker/shared-types';
import type { OpcoesDeAnalise } from './analise.js';
import type { ContextoDoJogador } from './contexto.js';
import { confiancaPelaMargem } from './regras.js';
import {
  ESQUEMA_DA_RECOMENDACAO,
  FERRAMENTAS_DE_CALCULO,
  INSTRUCOES,
  converterRecomendacao,
  executarFerramenta,
  semIA,
  situacaoParaIA,
  type ResultadoDoAgente,
} from './ferramentas.js';

/** Mensagem no formato da API de chat do Ollama. */
export interface MensagemOllama {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { function: { name: string; arguments: unknown } }[];
  tool_name?: string;
}

export interface RespostaOllama {
  message: MensagemOllama;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Erro HTTP devolvido pelo Ollama (por exemplo, modelo não baixado). */
export class ErroDoOllama extends Error {
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDoOllama';
    this.status = status;
  }
}

/** Como o agente chama o Ollama. Injetável para testar sem o Ollama instalado. */
export type ChamarOllama = (
  corpo: Record<string, unknown>,
  sinal: AbortSignal,
) => Promise<RespostaOllama>;

/** Implementação real: POST /api/chat no Ollama. */
export function clienteOllama(url: string): ChamarOllama {
  return async (corpo, sinal) => {
    const resposta = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...corpo, stream: false }),
      signal: sinal,
    });
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new ErroDoOllama(resposta.status, texto.slice(0, 300));
    }
    return (await resposta.json()) as RespostaOllama;
  };
}

export interface OpcoesDoAgenteOllama extends OpcoesDeAnalise {
  readonly chamar: ChamarOllama;
  readonly modelo: string;
  readonly sinal?: AbortSignal;
  readonly maxRodadas?: number;
}

const FERRAMENTAS = FERRAMENTAS_DE_CALCULO.map((f) => ({
  type: 'function',
  function: { name: f.nome, description: f.descricao, parameters: f.parametros },
}));

// O Ollama usa o esquema só para forçar o formato do JSON; as descrições dos campos não
// chegam ao modelo. Por isso as regras de texto vão aqui, no pedido. Textos curtos também
// deixam a resposta mais rápida (medido: ~20 tokens/s neste modelo).
const PEDIDO_FINAL = `Agora entregue a recomendação final em JSON, usando os números das ferramentas.
Regras:
- resumo: até 20 palavras.
- explicacao: no máximo 2 frases curtas, citando a equity e o necessário para pagar.
- alternativas: no máximo 2; cada "quando" com até 12 palavras.
- conceito: o conceito de poker que MAIS combina com esta jogada, com o nome e a ideia, em até 15 \
palavras. Escolha conforme o caso, por exemplo: "Pot odds: ...", "Apostar por valor: ...", \
"Posição: ...", "Blefe: ...", "Projetos (draws): ...". Não repita o resumo.
- confianca: escreva media (o sistema calcula o valor final pelos números).`;

export async function recomendarComOllama(
  c: ContextoDoJogador,
  analise: AnaliseDoCoach,
  o: OpcoesDoAgenteOllama,
): Promise<ResultadoDoAgente> {
  const sinal = o.sinal ?? AbortSignal.timeout(25_000);
  // Sem raciocínio estendido e temperatura baixa: respostas mais rápidas e estáveis.
  const comum = { model: o.modelo, think: false, keep_alive: '30m', options: { temperature: 0.2 } };
  const mensagens: MensagemOllama[] = [
    { role: 'system', content: INSTRUCOES },
    { role: 'user', content: situacaoParaIA(c, analise) },
  ];
  const usadas: string[] = [];
  let entrada = 0;
  let saida = 0;
  const jaTemOsNumeros = () => FERRAMENTAS_DE_CALCULO.every((f) => usadas.includes(f.nome));

  try {
    // Fase 1: o modelo decide quais cálculos pedir. Assim que tiver usado as duas
    // ferramentas, segue para a resposta final: uma rodada a mais só geraria texto
    // descartado (medido: 5 a 11 s a mais por análise). A saída de cada rodada também é
    // limitada, porque aqui só se esperam pedidos de ferramenta, não texto.
    for (let rodada = 0; rodada < (o.maxRodadas ?? 3) && !jaTemOsNumeros(); rodada++) {
      const r = await o.chamar(
        {
          ...comum,
          options: { ...comum.options, num_predict: 96 },
          messages: mensagens,
          tools: FERRAMENTAS,
        },
        sinal,
      );
      entrada += r.prompt_eval_count ?? 0;
      saida += r.eval_count ?? 0;
      const chamadas = r.message.tool_calls ?? [];
      if (chamadas.length === 0) break;

      mensagens.push({ role: 'assistant', content: r.message.content ?? '', tool_calls: chamadas });
      for (const chamada of chamadas) {
        const nome = chamada.function.name;
        usadas.push(nome);
        const resultado = executarFerramenta(
          nome,
          argumentos(chamada.function.arguments),
          c,
          analise,
          o,
        );
        mensagens.push({ role: 'tool', tool_name: nome, content: resultado.conteudo });
      }
    }

    // Se o modelo pulou as ferramentas, os números entram mesmo assim: nunca recomenda no escuro.
    if (!usadas.includes('avaliar_possibilidades')) {
      const r = executarFerramenta('avaliar_possibilidades', {}, c, analise, o);
      mensagens.push({
        role: 'user',
        content: `Resultado de avaliar_possibilidades: ${r.conteudo}`,
      });
    }

    // Fase 2: recomendação final em JSON, no formato exigido.
    mensagens.push({ role: 'user', content: PEDIDO_FINAL });
    const final = await o.chamar(
      {
        ...comum,
        options: { temperature: 0 },
        messages: mensagens,
        format: ESQUEMA_DA_RECOMENDACAO,
      },
      sinal,
    );
    entrada += final.prompt_eval_count ?? 0;
    saida += final.eval_count ?? 0;

    const recomendacao = converterRecomendacao(
      lerJson(final.message.content),
      c,
      analise,
      usadas,
      o.modelo,
    );
    if (!recomendacao) {
      return semIA(analise, 'A IA local sugeriu uma jogada inválida; usando o coach por regras.');
    }
    // Modelos pequenos erram a conta da confiança (medido); ela vem direto dos números.
    return {
      recomendacao: { ...recomendacao, confianca: confiancaPelaMargem(analise) },
      tokensDeEntrada: entrada,
      tokensDeSaida: saida,
    };
  } catch (erro) {
    return semIA(analise, descreverErro(erro, o.modelo));
  }
}

/** O Ollama devolve os argumentos como objeto; alguns modelos mandam texto JSON. */
function argumentos(valor: unknown): unknown {
  return typeof valor === 'string' ? lerJson(valor) : valor;
}

function lerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function descreverErro(erro: unknown, modelo: string): string {
  if (erro instanceof ErroDoOllama) {
    return erro.status === 404
      ? `Modelo ${modelo} não está baixado no Ollama (rode: ollama pull ${modelo}); usando o coach por regras.`
      : `Erro do Ollama (${erro.status}); usando o coach por regras.`;
  }
  if (erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) {
    return 'A IA local demorou demais; usando o coach por regras.';
  }
  if (erro instanceof TypeError) {
    return 'O Ollama não está rodando neste servidor; usando o coach por regras.';
  }
  return 'Erro inesperado na IA local; usando o coach por regras.';
}
