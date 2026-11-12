/**
 * Ações que um jogador pode tomar na sua vez, no Texas Hold'em No-Limit.
 * Entre parênteses, o termo em inglês usado nas mesas.
 *
 * - desistir (fold): abandona a mão.
 * - passar (check): não coloca fichas; só vale quando não há aposta a pagar.
 * - pagar (call): iguala a maior aposta da rodada.
 * - apostar (bet): primeira aposta da rodada.
 * - aumentar (raise): sobe uma aposta que já existe.
 * - all-in: coloca todas as fichas que restam.
 *
 * Em `apostar` e `aumentar`, `valor` é o total que o jogador terá apostado nesta
 * rodada depois da ação ("aumentar para 300"), e não quanto ele acrescenta.
 */
export type Acao =
  | { readonly tipo: 'desistir' }
  | { readonly tipo: 'passar' }
  | { readonly tipo: 'pagar' }
  | { readonly tipo: 'apostar'; readonly valor: number }
  | { readonly tipo: 'aumentar'; readonly valor: number }
  | { readonly tipo: 'all-in' };

export type TipoDeAcao = Acao['tipo'];
