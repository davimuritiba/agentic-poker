/**
 * Regras das rotas de autenticação, sem depender de node:http (o servidor.ts faz a ponte).
 *
 *   POST /api/auth/cadastro  { email, apelido, senha }  → cria a conta e já entra
 *   POST /api/auth/login     { email, senha }           → entra
 *   POST /api/auth/logout                               → sai (apaga o cookie)
 *   GET  /api/auth/eu                                   → quem está logado
 *
 * A sessão vai num cookie httpOnly (o JavaScript da página não consegue lê-lo) e
 * SameSite=Lax; os POST também exigem JSON, o que um formulário de outro site não envia.
 */
import { NOME_DO_COOKIE, VALIDADE_PADRAO_S, assinarSessao, lerSessaoDoCookie } from '@poker/sessao';
import type { DadosDeCadastro, RespostaDeAuth, Usuario } from '@poker/shared-types';
import { LimiteDeTentativas } from './limite.js';
import { HASH_DE_MENTIRA, conferirSenha, gerarHash } from './senha.js';
import { JaCadastrado, publico, type Usuarios } from './usuarios.js';
import { lerCadastro, lerLogin } from './validacao.js';

export interface Pedido {
  readonly metodo: string;
  readonly caminho: string;
  readonly ip: string;
  readonly cookie?: string;
  readonly tipoDoConteudo?: string;
  /** Corpo já convertido de JSON (undefined se vazio, `ERRO_DE_JSON` se inválido). */
  readonly corpo?: unknown;
}

export interface Resultado {
  readonly status: number;
  readonly corpo: RespostaDeAuth | { ok: boolean; motivo?: string };
  readonly cookie?: string;
}

export const ERRO_DE_JSON = Symbol('json inválido');

export interface OpcoesDoApp {
  readonly usuarios: Usuarios;
  readonly segredo: string;
  /** Marca o cookie como Secure (só trafega por HTTPS). */
  readonly cookieSeguro?: boolean;
  readonly validadeS?: number;
  readonly limite?: LimiteDeTentativas;
  readonly agora?: () => number;
}

const MOTIVO_LOGIN = 'E-mail ou senha incorretos.';

export function criarApp(opcoes: OpcoesDoApp) {
  const {
    usuarios,
    segredo,
    cookieSeguro = false,
    validadeS = VALIDADE_PADRAO_S,
    limite = new LimiteDeTentativas(20, 10 * 60_000),
    agora = Date.now,
  } = opcoes;

  const cookie = (valor: string, maxAge: number) =>
    [
      `${NOME_DO_COOKIE}=${valor}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAge}`,
      ...(cookieSeguro ? ['Secure'] : []),
    ].join('; ');

  const logado = (status: number, usuario: Usuario): Resultado => ({
    status,
    corpo: { ok: true, usuario: publico(usuario) },
    cookie: cookie(
      assinarSessao({ usuarioId: usuario.id, apelido: usuario.apelido }, segredo, {
        agora: agora(),
        validadeS,
      }),
      validadeS,
    ),
  });

  const recusa = (status: number, motivo: string, campo?: keyof DadosDeCadastro): Resultado => ({
    status,
    corpo: campo ? { ok: false, motivo, campo } : { ok: false, motivo },
  });

  async function cadastrar(pedido: Pedido): Promise<Resultado> {
    if (!limite.tentar(`cadastro:${pedido.ip}`, agora())) {
      return recusa(429, 'Muitas tentativas. Espere alguns minutos e tente de novo.');
    }
    const lido = lerCadastro(pedido.corpo);
    if (!lido.ok) return recusa(400, lido.motivo, lido.campo);
    const { email, apelido, senha } = lido.dados;
    try {
      const usuario = await usuarios.criar({ email, apelido, hashDaSenha: await gerarHash(senha) });
      return logado(201, usuario);
    } catch (erro) {
      if (erro instanceof JaCadastrado) {
        return erro.campo === 'email'
          ? recusa(409, 'Já existe uma conta com este e-mail.', 'email')
          : recusa(409, 'Este apelido já está em uso.', 'apelido');
      }
      throw erro;
    }
  }

  async function entrar(pedido: Pedido): Promise<Resultado> {
    if (!limite.tentar(`login:${pedido.ip}`, agora())) {
      return recusa(429, 'Muitas tentativas. Espere alguns minutos e tente de novo.');
    }
    const lido = lerLogin(pedido.corpo);
    if (!lido.ok) return recusa(400, lido.motivo, lido.campo);
    const usuario = await usuarios.buscarPorEmail(lido.dados.email);
    const confere = await conferirSenha(
      lido.dados.senha,
      usuario?.hashDaSenha ?? (await HASH_DE_MENTIRA),
    );
    if (!usuario || !confere) return recusa(401, MOTIVO_LOGIN);
    return logado(200, usuario);
  }

  async function quemSouEu(pedido: Pedido): Promise<Resultado> {
    const sessao = lerSessaoDoCookie(pedido.cookie, segredo, agora());
    const usuario = sessao ? await usuarios.buscarPorId(sessao.usuarioId) : null;
    if (!usuario) {
      return {
        ...recusa(401, 'Você não está logado.'),
        cookie: sessao ? cookie('', 0) : undefined,
      };
    }
    return { status: 200, corpo: { ok: true, usuario: publico(usuario) } };
  }

  return async function tratar(pedido: Pedido): Promise<Resultado> {
    const rota = `${pedido.metodo} ${pedido.caminho}`;
    if (rota === 'GET /saude') return { status: 200, corpo: { ok: true } };
    if (rota === 'GET /api/auth/eu') return quemSouEu(pedido);

    const ehPost = ['/api/auth/cadastro', '/api/auth/login', '/api/auth/logout'].includes(
      pedido.caminho,
    );
    if (!ehPost) return recusa(404, 'Rota não encontrada.');
    if (pedido.metodo !== 'POST') return recusa(405, 'Método não permitido.');
    if (!pedido.tipoDoConteudo?.toLowerCase().startsWith('application/json')) {
      return recusa(415, 'Envie o corpo em JSON.');
    }
    if (pedido.corpo === ERRO_DE_JSON) return recusa(400, 'JSON inválido.');

    switch (pedido.caminho) {
      case '/api/auth/cadastro':
        return cadastrar(pedido);
      case '/api/auth/login':
        return entrar(pedido);
      default:
        return { status: 200, corpo: { ok: true }, cookie: cookie('', 0) };
    }
  };
}
