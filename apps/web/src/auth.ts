/**
 * Chamadas ao serviço auth. A sessão fica num cookie httpOnly que o navegador envia
 * sozinho (inclusive no WebSocket do jogo); o JavaScript da página nunca vê o token.
 */
import type { DadosDeCadastro, DadosDeLogin, RespostaDeAuth, Usuario } from '@poker/shared-types';

const FORA_DO_AR: RespostaDeAuth = {
  ok: false,
  motivo: 'Não foi possível falar com o servidor. Tente de novo em instantes.',
};

async function chamar(caminho: string, corpo?: unknown): Promise<RespostaDeAuth> {
  try {
    const resposta = await fetch(`/api/auth/${caminho}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: 'same-origin',
    });
    const dados = (await resposta.json().catch(() => null)) as RespostaDeAuth | null;
    return dados ?? FORA_DO_AR;
  } catch {
    return FORA_DO_AR;
  }
}

/** Usuário logado, `null` se não há sessão, `undefined` se o servidor não respondeu. */
export async function buscarUsuario(): Promise<Usuario | null | undefined> {
  const r = await chamar('eu');
  if (r.ok) return r.usuario;
  return r === FORA_DO_AR ? undefined : null;
}

export const entrar = (dados: DadosDeLogin) => chamar('login', dados);
export const cadastrar = (dados: DadosDeCadastro) => chamar('cadastro', dados);
export const sair = () => chamar('logout', {});
