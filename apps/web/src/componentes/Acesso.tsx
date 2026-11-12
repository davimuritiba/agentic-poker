import type { DadosDeCadastro, RespostaDeAuth, Usuario } from '@poker/shared-types';
import { useState, type FormEvent } from 'react';
import { cadastrar, entrar } from '../auth.js';

type Modo = 'entrar' | 'cadastrar';
type Campo = keyof DadosDeCadastro;

interface Props {
  aoEntrar: (usuario: Usuario) => void;
}

/** Formulários de login e de criação de conta, alternados por abas. */
export function Acesso({ aoEntrar }: Props) {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [apelido, setApelido] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<{ motivo: string; campo?: Campo } | null>(null);

  const cadastro = modo === 'cadastrar';

  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setErro(null);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r: RespostaDeAuth = cadastro
      ? await cadastrar({ email, apelido, senha })
      : await entrar({ email, senha });
    setEnviando(false);
    if (r.ok) aoEntrar(r.usuario);
    else setErro({ motivo: r.motivo, campo: r.campo });
  };

  const erroDo = (campo: Campo) => (erro?.campo === campo ? 'erro-do-acesso' : undefined);

  return (
    <form className="cartao formulario-do-menu acesso" onSubmit={enviar} noValidate>
      <div className="abas" role="tablist" aria-label="Acesso">
        <button
          type="button"
          role="tab"
          aria-selected={!cadastro}
          className={cadastro ? 'aba' : 'aba ativa'}
          onClick={() => trocarModo('entrar')}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={cadastro}
          className={cadastro ? 'aba ativa' : 'aba'}
          onClick={() => trocarModo('cadastrar')}
        >
          Criar conta
        </button>
      </div>

      <label htmlFor="acesso-email">E-mail</label>
      <input
        id="acesso-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={erro?.campo === 'email'}
        aria-describedby={erroDo('email')}
        maxLength={254}
        required
        autoFocus
      />

      {cadastro && (
        <>
          <label htmlFor="acesso-apelido">Apelido na mesa</label>
          <input
            id="acesso-apelido"
            autoComplete="nickname"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            aria-invalid={erro?.campo === 'apelido'}
            aria-describedby={erroDo('apelido')}
            placeholder="Ex.: Davi"
            minLength={3}
            maxLength={20}
            required
          />
        </>
      )}

      <label htmlFor="acesso-senha">Senha</label>
      <input
        id="acesso-senha"
        type="password"
        autoComplete={cadastro ? 'new-password' : 'current-password'}
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        aria-invalid={erro?.campo === 'senha'}
        aria-describedby={erroDo('senha')}
        minLength={cadastro ? 8 : undefined}
        maxLength={128}
        required
      />
      {cadastro && <span className="detalhe">Pelo menos 8 caracteres.</span>}

      {erro && (
        <p id="erro-do-acesso" className="erro" role="alert">
          {erro.motivo}
        </p>
      )}

      <button
        type="submit"
        className="principal"
        disabled={enviando || !email.trim() || !senha || (cadastro && !apelido.trim())}
      >
        {enviando ? 'Aguarde…' : cadastro ? 'Criar conta e jogar' : 'Entrar'}
      </button>
    </form>
  );
}
