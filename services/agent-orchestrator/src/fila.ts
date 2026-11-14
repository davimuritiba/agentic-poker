/**
 * Fila de pedidos à IA. Um modelo local atende poucos pedidos ao mesmo tempo, e qualquer
 * jogador pode pedir uma análise: sem fila, vários pedidos juntos deixariam todos lentos.
 *
 * - `limite` pedidos rodam de cada vez; os demais esperam na ordem de chegada.
 * - Se a espera já tem `maxEsperando` pedidos, o novo é recusado na hora (o jogador recebe
 *   o coach por regras em vez de ficar esperando).
 * - O prazo do pedido (AbortSignal) conta desde a chegada, incluindo o tempo na fila.
 */
export class FilaCheia extends Error {
  constructor() {
    super('Fila da IA cheia.');
    this.name = 'FilaCheia';
  }
}

export class FilaDaIA {
  private ativos = 0;
  private readonly esperando: (() => void)[] = [];
  private readonly limite: number;
  private readonly maxEsperando: number;

  constructor(limite: number, maxEsperando: number) {
    this.limite = limite;
    this.maxEsperando = maxEsperando;
  }

  get emAndamento(): number {
    return this.ativos;
  }

  get naFila(): number {
    return this.esperando.length;
  }

  async executar<T>(tarefa: () => Promise<T>, sinal: AbortSignal): Promise<T> {
    if (this.ativos < this.limite) {
      this.ativos++;
    } else {
      if (this.esperando.length >= this.maxEsperando) throw new FilaCheia();
      await this.aguardarVez(sinal); // recebe a vaga de quem terminou, já contada em `ativos`
    }
    return this.rodar(tarefa);
  }

  /**
   * Baixa prioridade: só roda se a IA estiver livre agora (vaga sobrando e ninguém
   * esperando); senão, recusa na hora. Usado na leitura da mão, para nunca atrasar a
   * decisão de alguém.
   */
  async executarSeLivre<T>(tarefa: () => Promise<T>): Promise<T> {
    if (this.ativos >= this.limite || this.esperando.length > 0) throw new FilaCheia();
    this.ativos++;
    return this.rodar(tarefa);
  }

  private async rodar<T>(tarefa: () => Promise<T>): Promise<T> {
    try {
      return await tarefa();
    } finally {
      // Passa a vaga direto ao próximo da fila; assim ninguém "fura" a fila no meio.
      const proximo = this.esperando.shift();
      if (proximo) proximo();
      else this.ativos--;
    }
  }

  private aguardarVez(sinal: AbortSignal): Promise<void> {
    return new Promise((resolver, rejeitar) => {
      const liberar = () => {
        sinal.removeEventListener('abort', desistir);
        resolver();
      };
      const desistir = () => {
        const i = this.esperando.indexOf(liberar);
        if (i >= 0) this.esperando.splice(i, 1);
        rejeitar(sinal.reason);
      };
      if (sinal.aborted) return desistir();
      this.esperando.push(liberar);
      sinal.addEventListener('abort', desistir, { once: true });
    });
  }
}
