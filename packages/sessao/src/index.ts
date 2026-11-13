/**
 * Sessão do jogador: um token assinado (JWT HS256) guardado num cookie httpOnly.
 *
 * O serviço auth EMITE o token no login/cadastro; o game-engine só o VERIFICA com o mesmo
 * segredo, sem consultar o banco. Assim o jogo não precisa conhecer senhas nem usuários.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const NOME_DO_COOKIE = 'poker_sessao';
export const VALIDADE_PADRAO_S = 7 * 24 * 60 * 60;

/** Só para desenvolvimento local. Em produção AUTH_SEGREDO é obrigatório. */
const SEGREDO_DE_DESENVOLVIMENTO = 'segredo-de-desenvolvimento-troque-em-producao';

export interface DadosDaSessao {
  readonly usuarioId: string;
  readonly apelido: string;
}

export function segredoDaSessao(env: NodeJS.ProcessEnv = process.env): string {
  const segredo = env.AUTH_SEGREDO;
  if (segredo) {
    if (segredo.length < 32) throw new Error('AUTH_SEGREDO precisa ter pelo menos 32 caracteres.');
    return segredo;
  }
  if (env.NODE_ENV === 'production') throw new Error('Defina AUTH_SEGREDO em produção.');
  return SEGREDO_DE_DESENVOLVIMENTO;
}

const CABECALHO = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function assinarSessao(
  dados: DadosDaSessao,
  segredo: string,
  { agora = Date.now(), validadeS = VALIDADE_PADRAO_S } = {},
): string {
  const iat = Math.floor(agora / 1000);
  const corpo = base64url(
    JSON.stringify({ sub: dados.usuarioId, apelido: dados.apelido, iat, exp: iat + validadeS }),
  );
  return `${CABECALHO}.${corpo}.${assinatura(`${CABECALHO}.${corpo}`, segredo)}`;
}

/** Devolve os dados se o token for autêntico e não tiver expirado; senão, null. */
export function verificarSessao(
  token: string,
  segredo: string,
  agora = Date.now(),
): DadosDaSessao | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecalho, corpo, recebida] = partes as [string, string, string];
  if (cabecalho !== CABECALHO) return null; // recusa "alg: none" e afins

  const esperada = Buffer.from(assinatura(`${cabecalho}.${corpo}`, segredo));
  const obtida = Buffer.from(recebida);
  if (obtida.length !== esperada.length || !timingSafeEqual(obtida, esperada)) return null;

  let dados: unknown;
  try {
    dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const { sub, apelido, exp } = (dados ?? {}) as Record<string, unknown>;
  if (typeof sub !== 'string' || typeof apelido !== 'string' || typeof exp !== 'number') {
    return null;
  }
  if (exp * 1000 <= agora) return null;
  return { usuarioId: sub, apelido };
}

/** Lê um cookie do cabeçalho `Cookie` da requisição. */
export function lerCookie(cabecalho: string | undefined, nome: string): string | null {
  if (!cabecalho) return null;
  for (const par of cabecalho.split(';')) {
    const i = par.indexOf('=');
    if (i < 0 || par.slice(0, i).trim() !== nome) continue;
    try {
      return decodeURIComponent(par.slice(i + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function lerSessaoDoCookie(
  cabecalho: string | undefined,
  segredo: string,
  agora = Date.now(),
): DadosDaSessao | null {
  const token = lerCookie(cabecalho, NOME_DO_COOKIE);
  return token ? verificarSessao(token, segredo, agora) : null;
}

function assinatura(conteudo: string, segredo: string): string {
  return createHmac('sha256', segredo).update(conteudo).digest('base64url');
}

function base64url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64url');
}
