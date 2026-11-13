/**
 * Limite de tentativas por chave (ex.: IP) numa janela de tempo, para dificultar
 * adivinhar senhas na força bruta. Fica em memória: basta para um processo só.
 */
export class LimiteDeTentativas {
  private readonly janelas = new Map<string, { inicio: number; tentativas: number }>();

  private readonly maximo: number;
  private readonly janelaMs: number;

  constructor(maximo: number, janelaMs: number) {
    this.maximo = maximo;
    this.janelaMs = janelaMs;
  }

  /** Registra uma tentativa. Devolve false se a chave já passou do limite. */
  tentar(chave: string, agora = Date.now()): boolean {
    let janela = this.janelas.get(chave);
    if (!janela || agora - janela.inicio >= this.janelaMs) {
      janela = { inicio: agora, tentativas: 0 };
      this.janelas.set(chave, janela);
      if (this.janelas.size > 10_000) this.limpar(agora);
    }
    janela.tentativas += 1;
    return janela.tentativas <= this.maximo;
  }

  private limpar(agora: number): void {
    for (const [chave, janela] of this.janelas) {
      if (agora - janela.inicio >= this.janelaMs) this.janelas.delete(chave);
    }
  }
}
