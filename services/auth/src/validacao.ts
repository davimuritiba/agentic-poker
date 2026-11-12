/**
 * Validação do que chega do cliente. Devolve dados limpos ou o primeiro problema encontrado,
 * com o campo, para a tela mostrar o erro no lugar certo.
 */
import type { DadosDeCadastro, DadosDeLogin } from '@poker/shared-types';

export type Validado<T> =
  { ok: true; dados: T } | { ok: false; motivo: string; campo?: keyof DadosDeCadastro };

export const SENHA_MINIMA = 8;
const SENHA_MAXIMA = 128;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Letras (com acento), números, espaço, ponto, hífen e sublinhado.
const APELIDO = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export function limparEmail(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const email = valor.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function lerCadastro(corpo: unknown): Validado<DadosDeCadastro> {
  const { email, apelido, senha } = (corpo ?? {}) as Record<string, unknown>;

  const emailLimpo = limparEmail(email);
  if (!emailLimpo) return { ok: false, campo: 'email', motivo: 'Informe um e-mail válido.' };

  if (typeof apelido !== 'string') {
    return { ok: false, campo: 'apelido', motivo: 'Escolha um apelido.' };
  }
  const apelidoLimpo = apelido.replace(/\s+/g, ' ').trim();
  if (apelidoLimpo.length < 3 || apelidoLimpo.length > 20) {
    return { ok: false, campo: 'apelido', motivo: 'O apelido deve ter de 3 a 20 caracteres.' };
  }
  if (!APELIDO.test(apelidoLimpo)) {
    return {
      ok: false,
      campo: 'apelido',
      motivo: 'Use só letras, números, espaço, ponto, hífen ou sublinhado no apelido.',
    };
  }
  if (/\bbot\b/i.test(apelidoLimpo)) {
    return { ok: false, campo: 'apelido', motivo: 'O apelido não pode conter "bot".' };
  }

  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    return {
      ok: false,
      campo: 'senha',
      motivo: `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`,
    };
  }
  if (senha.length > SENHA_MAXIMA) {
    return {
      ok: false,
      campo: 'senha',
      motivo: `A senha pode ter até ${SENHA_MAXIMA} caracteres.`,
    };
  }

  return { ok: true, dados: { email: emailLimpo, apelido: apelidoLimpo, senha } };
}

export function lerLogin(corpo: unknown): Validado<DadosDeLogin> {
  const { email, senha } = (corpo ?? {}) as Record<string, unknown>;
  const emailLimpo = limparEmail(email);
  if (!emailLimpo) return { ok: false, campo: 'email', motivo: 'Informe um e-mail válido.' };
  if (typeof senha !== 'string' || senha.length === 0 || senha.length > SENHA_MAXIMA) {
    return { ok: false, campo: 'senha', motivo: 'Informe a sua senha.' };
  }
  return { ok: true, dados: { email: emailLimpo, senha } };
}
