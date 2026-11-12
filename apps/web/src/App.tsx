import type { Usuario } from '@poker/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { buscarUsuario, sair } from './auth.js';
import { useConexao } from './conexao.js';
import { lembrarMesa } from './identidade.js';
import { Lobby } from './componentes/Lobby.js';
import { Mesa } from './componentes/Mesa.js';
import { MenuInicial } from './componentes/MenuInicial.js';

const RODAPE = (
  <footer className="rodape">
    Fichas virtuais, sem valor em dinheiro. Jogos de azar com dinheiro real são restritos a maiores
    de idade.
  </footer>
);

export function App() {
  /** `undefined` enquanto confere a sessão; `null` se ninguém está logado. */
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [noMenu, setNoMenu] = useState(true);

  useEffect(() => {
    let ativo = true;
    const conferir = async () => {
      const u = await buscarUsuario();
      if (!ativo) return;
      // Servidor fora do ar: tenta de novo em instantes, sem jogar o usuário para o login.
      if (u === undefined) setTimeout(() => void conferir(), 2_000);
      else setUsuario(u);
    };
    void conferir();
    return () => {
      ativo = false;
    };
  }, []);

  const perderSessao = useCallback(() => {
    setUsuario(null);
    setNoMenu(true);
  }, []);
  const conexao = useConexao(usuario?.id ?? null, perderSessao);

  const sairDaConta = async () => {
    if (conexao.visao) await conexao.sair();
    lembrarMesa(null);
    await sair();
    perderSessao();
  };

  // Numa reconexão o servidor devolve a mesa em que o jogador estava: vai direto para ela.
  if (!usuario || (!conexao.visao && noMenu)) {
    return (
      <div className="app">
        <MenuInicial
          usuario={usuario}
          conectado={conexao.conectado}
          aoEntrar={setUsuario}
          jogar={() => setNoMenu(false)}
          sairDaConta={() => void sairDaConta()}
        />
        {RODAPE}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topo">
        <h1>
          <span aria-hidden="true">♠</span> Agentic Poker
        </h1>
        <div className="conta">
          <p className="servico" title="Microsserviço que atende esta tela">
            <span className={conexao.conectado ? 'luz ligada' : 'luz'} aria-hidden="true" />
            game-engine · WebSocket {conexao.conectado ? 'conectado' : 'desconectado'}
          </p>
          <span className="apelido-logado">{usuario.apelido}</span>
          <button type="button" className="secundario" onClick={() => void sairDaConta()}>
            Sair
          </button>
        </div>
      </header>

      {conexao.visao ? (
        <Mesa
          visao={conexao.visao}
          agir={conexao.agir}
          sair={conexao.sair}
          adicionarBot={conexao.adicionarBot}
          pedirCoach={conexao.pedirCoach}
          coach={conexao.coach}
        />
      ) : (
        <Lobby
          mesas={conexao.mesas}
          conectado={conexao.conectado}
          entrar={conexao.entrar}
          voltar={() => setNoMenu(true)}
        />
      )}

      {RODAPE}
    </div>
  );
}
