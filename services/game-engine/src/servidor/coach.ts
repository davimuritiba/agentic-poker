/**
 * Ponte entre o servidor do jogo e o microsserviço Agent Orchestrator.
 *
 * O jogo envia ao orquestrador a MESMA visão filtrada que o jogador recebe na tela.
 * Assim, por construção, o coach não tem acesso a cartas ocultas nem ao baralho.
 */
import {
  PERFIL_RECOMENDADO,
  ehPerfilDoCoach,
  lerLinhas,
  type AnaliseDoCoach,
  type EscritaDoCoach,
  type LeituraDoCoach,
  type PedidoAoCoach,
  type PerfilDoCoach,
  type RecomendacaoDoCoach,
  type VisaoDaMesa,
} from '@poker/shared-types';

const URL_DO_ORQUESTRADOR = process.env.AGENT_ORCHESTRATOR_URL ?? 'http://127.0.0.1:3002';

type Resultado<T> = { ok: true; dados: T } | { ok: false; motivo: string };

const INDISPONIVEL = 'Coach indisponível no momento (agent-orchestrator fora do ar?).';

/**
 * Pede ao orquestrador. Com `aoEscrever`, pede a resposta AO VIVO (NDJSON): cada linha de
 * progresso (passos do agente, texto parcial) vai para `aoEscrever`, e a última traz a
 * resposta final.
 */
async function pedir<T>(
  rota: string,
  visao: VisaoDaMesa,
  perfil: PerfilDoCoach,
  prazoMs: number,
  aoEscrever?: (escrita: EscritaDoCoach) => void,
): Promise<Resultado<T>> {
  try {
    const resposta = await fetch(`${URL_DO_ORQUESTRADOR}${rota}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(aoEscrever && { accept: 'application/x-ndjson' }),
      },
      body: JSON.stringify({ visao, perfil }),
      signal: AbortSignal.timeout(prazoMs),
    });
    const aoVivo = (resposta.headers.get('content-type') ?? '').includes('ndjson');
    if (!resposta.ok || !aoVivo || !resposta.body) {
      const corpo = (await resposta.json()) as T & { motivo?: string };
      return resposta.ok
        ? { ok: true, dados: corpo }
        : { ok: false, motivo: corpo.motivo ?? 'Coach indisponível.' };
    }
    return await lerRespostaAoVivo<T>(resposta.body, aoEscrever);
  } catch {
    return { ok: false, motivo: INDISPONIVEL };
  }
}

/** Lê a resposta em linhas: repassa cada `escrita` e devolve o `final`. */
export async function lerRespostaAoVivo<T>(
  corpo: ReadableStream<Uint8Array>,
  aoEscrever?: (escrita: EscritaDoCoach) => void,
): Promise<Resultado<T>> {
  for await (const linha of lerLinhas(corpo)) {
    const mensagem = JSON.parse(linha) as
      { tipo: 'escrita'; escrita: EscritaDoCoach } | { tipo: 'final'; dados: T };
    if (mensagem.tipo === 'escrita') aoEscrever?.(mensagem.escrita);
    else if (mensagem.tipo === 'final') return { ok: true, dados: mensagem.dados };
  }
  return { ok: false, motivo: INDISPONIVEL };
}

type AoEscrever = (escrita: EscritaDoCoach) => void;

export const pedirAnalise = (visao: VisaoDaMesa, perfil: PerfilDoCoach) =>
  pedir<AnaliseDoCoach>('/coach/analise', visao, perfil, 5_000);
export const pedirRecomendacao = (
  visao: VisaoDaMesa,
  perfil: PerfilDoCoach,
  aoEscrever?: AoEscrever,
) => pedir<RecomendacaoDoCoach>('/coach/recomendacao', visao, perfil, 40_000, aoEscrever);
export const pedirLeitura = (visao: VisaoDaMesa, perfil: PerfilDoCoach, aoEscrever?: AoEscrever) =>
  pedir<LeituraDoCoach>('/coach/leitura', visao, perfil, 30_000, aoEscrever);

/** Lê o pedido do cliente (que não é confiável): modo e perfil, com padrões seguros. */
export function lerPedidoAoCoach(dado: unknown): PedidoAoCoach {
  const d = (typeof dado === 'object' && dado !== null ? dado : {}) as Record<string, unknown>;
  return {
    modo: d.modo === 'leitura' ? 'leitura' : 'decisao',
    perfil: ehPerfilDoCoach(d.perfil) ? d.perfil : PERFIL_RECOMENDADO,
  };
}

/**
 * Limita pedidos por jogador: um intervalo mínimo entre eles e, se `umPorVez`, só um em
 * andamento. As decisões não usam `umPorVez`: trocar de perfil no meio da decisão manda um
 * pedido novo, e o orquestrador cancela o anterior.
 */
export class LimiteDoCoach {
  private readonly ultimoPedido = new Map<string, number>();
  private readonly emAndamento = new Set<string>();
  private readonly intervaloMinimoMs: number;
  private readonly umPorVez: boolean;

  constructor(intervaloMinimoMs = 1_500, { umPorVez = true }: { umPorVez?: boolean } = {}) {
    this.intervaloMinimoMs = intervaloMinimoMs;
    this.umPorVez = umPorVez;
  }

  tentarComecar(jogadorId: string, agora = Date.now()): string | null {
    if (this.umPorVez && this.emAndamento.has(jogadorId)) {
      return 'O coach ainda está analisando o seu último pedido.';
    }
    if (agora - (this.ultimoPedido.get(jogadorId) ?? 0) < this.intervaloMinimoMs) {
      return 'Aguarde um instante antes de pedir outra análise.';
    }
    this.ultimoPedido.set(jogadorId, agora);
    if (this.umPorVez) this.emAndamento.add(jogadorId);
    return null;
  }

  terminar(jogadorId: string): void {
    this.emAndamento.delete(jogadorId);
  }
}
