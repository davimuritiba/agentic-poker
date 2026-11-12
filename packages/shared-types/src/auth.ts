/** Conta de jogador, como o serviço auth a devolve ao cliente (nunca inclui a senha). */
export interface Usuario {
  readonly id: string;
  readonly email: string;
  readonly apelido: string;
}

/** Corpo de POST /api/auth/cadastro. */
export interface DadosDeCadastro {
  readonly email: string;
  readonly apelido: string;
  readonly senha: string;
}

/** Corpo de POST /api/auth/login. */
export interface DadosDeLogin {
  readonly email: string;
  readonly senha: string;
}

/** Resposta das rotas de autenticação: o usuário logado ou o motivo da recusa. */
export type RespostaDeAuth =
  | { readonly ok: true; readonly usuario: Usuario }
  | { readonly ok: false; readonly motivo: string; readonly campo?: keyof DadosDeCadastro };
