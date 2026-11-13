/**
 * Ponte entre o servidor do jogo e o microsserviço Agent Orchestrator.
 *
 * O jogo envia ao orquestrador a MESMA visão filtrada que o jogador recebe na tela.
 * Assim, por construção, o coach não tem acesso a cartas ocultas nem ao baralho.
 */
import type { AnaliseDoCoach, RecomendacaoDoCoach, VisaoDaMesa } from '@poker/shared-types';

const URL_DO_ORQUESTRADOR = process.env.AGENT_ORCHESTRATOR_URL ?? 'http://127.0.0.1:3002';
const INTERVALO_MINIMO_MS = 1_500;

type Resultado<T> = { ok: true; dados: T } | { ok: false; motivo: string };

async function pedir<T>(rota: string, visao: VisaoDaMesa, prazoMs: number): Promise<Resultado<T>> {
  try {
    const resposta = await fetch(`${URL_DO_ORQUESTRADOR}${rota}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visao }),
      signal: AbortSignal.timeout(prazoMs),
    });
    const corpo = (await resposta.json()) as T & { motivo?: string };
    return resposta.ok
      ? { ok: true, dados: corpo }
      : { ok: false, motivo: corpo.motivo ?? 'Coach indisponível.' };
  } catch {
    return { ok: false, motivo: 'Coach indisponível no momento (agent-orchestrator fora do ar?).' };
  }
}

export const pedirAnalise = (visao: VisaoDaMesa) =>
  pedir<AnaliseDoCoach>('/coach/analise', visao, 5_000);
export const pedirRecomendacao = (visao: VisaoDaMesa) =>
  pedir<RecomendacaoDoCoach>('/coach/recomendacao', visao, 40_000);

/** Limita pedidos por jogador: um de cada vez, com um intervalo mínimo entre eles. */
export class LimiteDoCoach {
  private readonly ultimoPedido = new Map<string, number>();
  private readonly emAndamento = new Set<string>();

  tentarComecar(jogadorId: string, agora = Date.now()): string | null {
    if (this.emAndamento.has(jogadorId))
      return 'O coach ainda está analisando o seu último pedido.';
    if (agora - (this.ultimoPedido.get(jogadorId) ?? 0) < INTERVALO_MINIMO_MS) {
      return 'Aguarde um instante antes de pedir outra análise.';
    }
    this.ultimoPedido.set(jogadorId, agora);
    this.emAndamento.add(jogadorId);
    return null;
  }

  terminar(jogadorId: string): void {
    this.emAndamento.delete(jogadorId);
  }
}
