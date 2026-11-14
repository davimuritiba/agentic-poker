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
import type { AnaliseDoCoach, LeituraDoCoach, TextoParcialDoCoach } from '@poker/shared-types';
import type { OpcoesDeAnalise } from './analise.js';
import type { ContextoDoJogador } from './contexto.js';
import {
  ESQUEMA_DA_LEITURA,
  ESQUEMA_DA_RECOMENDACAO,
  FERRAMENTAS_DE_CALCULO,
  INSTRUCOES,
  converterLeitura,
  converterRecomendacao,
  descreverEtapa,
  executarFerramenta,
  pedidoDaLeitura,
  semIA,
  situacaoParaIA,
  textoParcial,
  type AoProgredir,
  type ResultadoDoAgente,
} from './ferramentas.js';
import { lerJsonParcial } from './json-parcial.js';
import { lerLinhas } from '@poker/shared-types';
import { confiancaPelaMargem, lerPorRegras } from './regras.js';

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

/**
 * Como o agente chama o Ollama. Injetável para testar sem o Ollama instalado.
 * Com `aoEscrever`, a resposta vem em streaming: `aoEscrever` recebe o texto acumulado a
 * cada pedaço que o modelo gera.
 */
export type ChamarOllama = (
  corpo: Record<string, unknown>,
  sinal: AbortSignal,
  aoEscrever?: (acumulado: string) => void,
) => Promise<RespostaOllama>;

/** Implementação real: POST /api/chat no Ollama. */
export function clienteOllama(url: string): ChamarOllama {
  return async (corpo, sinal, aoEscrever) => {
    const resposta = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...corpo, stream: aoEscrever !== undefined }),
      signal: sinal,
    });
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new ErroDoOllama(resposta.status, texto.slice(0, 300));
    }
    if (!aoEscrever || !resposta.body) return (await resposta.json()) as RespostaOllama;

    // Streaming: uma linha JSON por pedaço gerado; a última traz `done` e as contagens.
    let acumulado = '';
    let contagens: Pick<RespostaOllama, 'prompt_eval_count' | 'eval_count'> = {};
    for await (const linha of lerLinhas(resposta.body)) {
      const parte = JSON.parse(linha) as Partial<RespostaOllama> & {
        done?: boolean;
        error?: string;
      };
      if (parte.error) throw new ErroDoOllama(500, parte.error);
      if (parte.message?.content) {
        acumulado += parte.message.content;
        aoEscrever(acumulado);
      }
      if (parte.done) {
        contagens = { prompt_eval_count: parte.prompt_eval_count, eval_count: parte.eval_count };
      }
    }
    return { message: { role: 'assistant', content: acumulado }, ...contagens };
  };
}

export interface OpcoesDoAgenteOllama extends OpcoesDeAnalise {
  readonly chamar: ChamarOllama;
  readonly modelo: string;
  readonly sinal?: AbortSignal;
  readonly maxRodadas?: number;
  /** Recebe os passos do agente e o texto da recomendação enquanto ela é escrita. */
  readonly aoProgredir?: AoProgredir;
}

/**
 * Repassa o progresso ao vivo, sem repetir quando nada mudou (o modelo gera pedaços
 * que às vezes não completam nenhum campo visível).
 */
function narrador(aoProgredir: AoProgredir | undefined) {
  const etapas: string[] = [];
  let ultimo = '';
  const enviar = (texto: TextoParcialDoCoach = {}) => {
    if (!aoProgredir) return;
    const progresso = { etapas: [...etapas], texto };
    const assinatura = JSON.stringify(progresso);
    if (assinatura === ultimo) return;
    ultimo = assinatura;
    aoProgredir(progresso);
  };
  return {
    etapa(frase: string) {
      etapas.push(frase);
      enviar();
    },
    /** Para usar como `aoEscrever`: lê o JSON parcial e envia os campos já escritos. */
    escrevendo: (acumulado: string) => enviar(textoParcial(lerJsonParcial(acumulado))),
  };
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
  const narrar = narrador(o.aoProgredir);
  narrar.etapa('Analisando a situação da mesa…');

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
        const entradaDaFerramenta = argumentos(chamada.function.arguments);
        const resultado = executarFerramenta(nome, entradaDaFerramenta, c, analise, o);
        mensagens.push({ role: 'tool', tool_name: nome, content: resultado.conteudo });
        narrar.etapa(descreverEtapa(nome, entradaDaFerramenta, resultado, analise.perfil));
      }
    }

    // Se o modelo pulou as ferramentas, os números entram mesmo assim: nunca recomenda no escuro.
    if (!usadas.includes('avaliar_possibilidades')) {
      const r = executarFerramenta('avaliar_possibilidades', {}, c, analise, o);
      mensagens.push({
        role: 'user',
        content: `Resultado de avaliar_possibilidades: ${r.conteudo}`,
      });
      narrar.etapa(descreverEtapa('avaliar_possibilidades', {}, r, analise.perfil));
    }

    // Fase 2: recomendação final em JSON, no formato exigido, escrita ao vivo para o jogador.
    narrar.etapa('Escrevendo a recomendação…');
    mensagens.push({ role: 'user', content: PEDIDO_FINAL });
    const final = await o.chamar(
      {
        ...comum,
        options: { temperature: 0 },
        messages: mensagens,
        format: ESQUEMA_DA_RECOMENDACAO,
      },
      sinal,
      o.aoProgredir ? narrar.escrevendo : undefined,
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

/**
 * Leitura da mão em tempo real (fora da vez do jogador): uma chamada só, sem ferramentas,
 * porque os números já vão no pedido. Curta para ficar rápida.
 */
export async function lerComOllama(
  c: ContextoDoJogador,
  analise: AnaliseDoCoach,
  o: { chamar: ChamarOllama; modelo: string; sinal?: AbortSignal; aoProgredir?: AoProgredir },
): Promise<LeituraDoCoach> {
  const narrar = narrador(o.aoProgredir);
  narrar.etapa('Lendo a sua mão…');
  try {
    const r = await o.chamar(
      {
        model: o.modelo,
        think: false,
        keep_alive: '30m',
        options: { temperature: 0.3, num_predict: 160 },
        messages: [
          { role: 'system', content: INSTRUCOES },
          { role: 'user', content: pedidoDaLeitura(c, analise) },
        ],
        format: ESQUEMA_DA_LEITURA,
      },
      o.sinal ?? AbortSignal.timeout(20_000),
      o.aoProgredir ? narrar.escrevendo : undefined,
    );
    return (
      converterLeitura(lerJson(r.message.content), analise, o.modelo) ??
      lerPorRegras(analise, 'A IA local respondeu fora do formato; leitura pelas regras.')
    );
  } catch (erro) {
    return lerPorRegras(
      analise,
      descreverErro(erro, o.modelo).replace('o coach por regras', 'as regras'),
    );
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
