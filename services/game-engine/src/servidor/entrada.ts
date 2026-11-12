/**
 * Validação do que chega pela rede. O cliente não é confiável: qualquer um pode abrir o
 * console do navegador e mandar o que quiser, então tudo é conferido antes de usar.
 */
import { lerSessaoDoCookie } from '@poker/sessao';
import type { Acao, Identificacao } from '@poker/shared-types';

const ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

export function lerIdentificacao(auth: unknown): Identificacao | null {
  if (typeof auth !== 'object' || auth === null) return null;
  const { jogadorId, nome } = auth as Record<string, unknown>;
  if (typeof jogadorId !== 'string' || !ID_VALIDO.test(jogadorId)) return null;
  if (jogadorId.startsWith('bot-')) return null; // ids de bot são reservados
  if (typeof nome !== 'string') return null;
  const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, 20);
  if (limpo.length === 0 || /\(bot\)/i.test(limpo)) return null; // humano não se passa por bot
  return { jogadorId, nome: limpo };
}

/**
 * Quem está abrindo o WebSocket: lido do cookie de sessão assinado pelo serviço auth.
 * Sem sessão válida, ninguém entra.
 */
export function identificacaoDoCookie(
  cookie: string | undefined,
  segredo: string,
  agora = Date.now(),
): Identificacao | null {
  const sessao = lerSessaoDoCookie(cookie, segredo, agora);
  return sessao ? lerIdentificacao({ jogadorId: sessao.usuarioId, nome: sessao.apelido }) : null;
}

export function lerAcao(dado: unknown): Acao | null {
  if (typeof dado !== 'object' || dado === null) return null;
  const { tipo, valor } = dado as Record<string, unknown>;
  switch (tipo) {
    case 'desistir':
    case 'passar':
    case 'pagar':
    case 'all-in':
      return { tipo };
    case 'apostar':
    case 'aumentar':
      return typeof valor === 'number' ? { tipo, valor } : null;
    default:
      return null;
  }
}
