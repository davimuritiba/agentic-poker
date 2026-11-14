import {
  DESCRICOES_DOS_PERFIS,
  NOMES_DOS_PERFIS,
  PERFIS_DO_COACH,
  type Carta,
  type PerfilDoCoach,
  type Usuario,
} from '@poker/shared-types';
import { useState } from 'react';
import { lerPerfil, salvarPerfil } from '../perfilDoCoach.js';
import { Acesso } from './Acesso.js';
import { CartaVisual } from './CartaVisual.js';

interface Props {
  /** `undefined` enquanto confere a sessão; `null` se ninguém está logado. */
  usuario: Usuario | null | undefined;
  conectado: boolean;
  aoEntrar: (usuario: Usuario) => void;
  /** Segue para a escolha de mesa. */
  jogar: () => void;
  sairDaConta: () => void;
}

/** Royal flush de espadas, só como enfeite da tela de abertura. */
const LEQUE: Carta[] = [
  { valor: 10, naipe: 'espadas' },
  { valor: 11, naipe: 'espadas' },
  { valor: 12, naipe: 'espadas' },
  { valor: 13, naipe: 'espadas' },
  { valor: 14, naipe: 'espadas' },
];

const RANKING_DAS_MAOS: [string, string][] = [
  ['Royal flush', 'A, K, Q, J e 10 do mesmo naipe'],
  ['Straight flush', 'Cinco cartas em sequência do mesmo naipe'],
  ['Quadra', 'Quatro cartas do mesmo valor'],
  ['Full house', 'Uma trinca e um par'],
  ['Flush', 'Cinco cartas do mesmo naipe'],
  ['Sequência', 'Cinco cartas em sequência'],
  ['Trinca', 'Três cartas do mesmo valor'],
  ['Dois pares', 'Dois pares diferentes'],
  ['Par', 'Duas cartas do mesmo valor'],
  ['Carta alta', 'Nenhuma combinação: vale a maior carta'],
];

export function MenuInicial({ usuario, conectado, aoEntrar, jogar, sairDaConta }: Props) {
  const [mostrarRegras, setMostrarRegras] = useState(false);
  const [perfil, setPerfil] = useState(lerPerfil);
  const escolherPerfil = (novo: PerfilDoCoach) => {
    setPerfil(novo);
    salvarPerfil(novo);
  };
  const botaoDeRegras = (
    <button
      type="button"
      className="secundario"
      aria-expanded={mostrarRegras}
      aria-controls="como-jogar"
      onClick={() => setMostrarRegras((v) => !v)}
    >
      {mostrarRegras ? 'Esconder regras' : 'Como jogar'}
    </button>
  );

  return (
    <main className="menu-inicial">
      <div className="leque" aria-hidden="true">
        {LEQUE.map((c) => (
          <CartaVisual key={c.valor} carta={c} />
        ))}
      </div>

      <h1 className="titulo-do-jogo">Agentic Poker</h1>
      <p className="subtitulo">Texas Hold'em No-Limit · fichas virtuais</p>

      {usuario === undefined ? (
        <p className="detalhe">Carregando…</p>
      ) : usuario === null ? (
        <>
          <Acesso aoEntrar={aoEntrar} />
          {botaoDeRegras}
        </>
      ) : (
        <div className="cartao formulario-do-menu">
          <p className="boas-vindas">
            Jogando como <strong>{usuario.apelido}</strong>
          </p>
          <fieldset className="tipo-de-coach">
            <legend>Tipo de coach</legend>
            {PERFIS_DO_COACH.map((p) => (
              <label key={p} className={perfil === p ? 'opcao-coach ativa' : 'opcao-coach'}>
                <input
                  type="radio"
                  name="perfil-do-coach"
                  value={p}
                  checked={perfil === p}
                  onChange={() => escolherPerfil(p)}
                />
                <span className="opcao-coach-texto">
                  <strong>{NOMES_DOS_PERFIS[p]}</strong>
                  <span className="detalhe">{DESCRICOES_DOS_PERFIS[p]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="principal" onClick={jogar} autoFocus>
            Jogar
          </button>
          {botaoDeRegras}
          <button type="button" className="secundario" onClick={sairDaConta}>
            Sair da conta
          </button>
        </div>
      )}

      {mostrarRegras && (
        <section id="como-jogar" className="cartao como-jogar">
          <h2>Como jogar</h2>
          <ol className="passos">
            <li>Cada jogador recebe duas cartas fechadas.</li>
            <li>
              Cinco cartas comunitárias são abertas em três etapas: flop (3), turn (1) e river (1).
            </li>
            <li>
              Em cada rodada de apostas você pode passar, pagar, apostar, subir ou desistir. No
              No-Limit dá para apostar todas as fichas (all-in) a qualquer momento.
            </li>
            <li>
              Vence quem formar a melhor mão de 5 cartas, ou quem sobrar quando os outros desistem.
            </li>
          </ol>
          <h3>Ranking das mãos</h3>
          <ol className="ranking">
            {RANKING_DAS_MAOS.map(([mao, descricao]) => (
              <li key={mao}>
                <strong>{mao}</strong>
                <span className="detalhe">{descricao}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {usuario && (
        <p className="servico">
          <span className={conectado ? 'luz ligada' : 'luz'} aria-hidden="true" />
          {conectado ? 'Servidor online' : 'Conectando ao servidor…'}
        </p>
      )}
    </main>
  );
}
