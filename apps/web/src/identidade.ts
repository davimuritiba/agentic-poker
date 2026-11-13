/**
 * O que o navegador lembra entre visitas: a mesa em que o jogador estava, para voltar a ela
 * numa reconexão. Quem é o jogador vem da conta (cookie de sessão do serviço auth).
 */
const CHAVE_MESA = 'poker:mesa';

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // Navegação privada ou armazenamento bloqueado: segue sem lembrar.
  }
}

export const mesaLembrada = () => ler(CHAVE_MESA);
export const lembrarMesa = (mesaId: string | null) => gravar(CHAVE_MESA, mesaId);
