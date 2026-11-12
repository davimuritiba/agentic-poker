/**
 * Onde as contas ficam guardadas. A interface separa as regras (app.ts) do Postgres,
 * então os testes usam a versão em memória e não precisam de banco.
 */
import { randomUUID } from 'node:crypto';
import type { Usuario } from '@poker/shared-types';

export interface UsuarioGuardado extends Usuario {
  readonly hashDaSenha: string;
}

export interface NovoUsuario {
  readonly email: string;
  readonly apelido: string;
  readonly hashDaSenha: string;
}

/** Lançado quando o e-mail ou o apelido já pertence a outra conta. */
export class JaCadastrado extends Error {
  readonly campo: 'email' | 'apelido';

  constructor(campo: 'email' | 'apelido') {
    super(`${campo} já cadastrado`);
    this.campo = campo;
  }
}

export interface Usuarios {
  criar(novo: NovoUsuario): Promise<UsuarioGuardado>;
  buscarPorEmail(email: string): Promise<UsuarioGuardado | null>;
  buscarPorId(id: string): Promise<UsuarioGuardado | null>;
}

export class UsuariosEmMemoria implements Usuarios {
  private readonly lista: UsuarioGuardado[] = [];

  async criar(novo: NovoUsuario): Promise<UsuarioGuardado> {
    if (this.lista.some((u) => u.email === novo.email)) throw new JaCadastrado('email');
    const apelido = novo.apelido.toLowerCase();
    if (this.lista.some((u) => u.apelido.toLowerCase() === apelido)) {
      throw new JaCadastrado('apelido');
    }
    const usuario = { id: randomUUID(), ...novo };
    this.lista.push(usuario);
    return usuario;
  }

  async buscarPorEmail(email: string): Promise<UsuarioGuardado | null> {
    return this.lista.find((u) => u.email === email) ?? null;
  }

  async buscarPorId(id: string): Promise<UsuarioGuardado | null> {
    return this.lista.find((u) => u.id === id) ?? null;
  }
}

/** O que pode sair do serviço: tudo menos o hash da senha. */
export function publico({ id, email, apelido }: Usuario): Usuario {
  return { id, email, apelido };
}
