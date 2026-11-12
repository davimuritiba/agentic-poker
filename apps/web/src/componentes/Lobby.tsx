import type { Resposta, ResumoDaMesa } from '@poker/shared-types';
import { useState } from 'react';
import { fichas } from '../formatacao.js';

interface Props {
  mesas: readonly ResumoDaMesa[];
  conectado: boolean;
  entrar: (mesaId: string) => Promise<Resposta>;
  voltar: () => void;
}

export function Lobby({ mesas, conectado, entrar, voltar }: Props) {
  const [erro, setErro] = useState<string | null>(null);

  const entrarNa = async (mesaId: string) => {
    setErro(null);
    const r = await entrar(mesaId);
    if (!r.ok) setErro(r.motivo);
  };

  return (
    <main className="lobby">
      <button type="button" className="secundario voltar-ao-menu" onClick={voltar}>
        ← Menu inicial
      </button>
      <section className="cartao">
        <h2>Mesas</h2>
        {!conectado && <p className="aviso">Conectando ao servidor…</p>}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <ul className="lista-de-mesas">
          {mesas.map((m) => (
            <li key={m.id}>
              <div>
                <strong>{m.nome}</strong>
                <span className="detalhe">
                  Blinds {fichas(m.smallBlind)}/{fichas(m.bigBlind)} · {m.jogadores}/
                  {m.maxJogadores} jogadores
                  {m.bots > 0 ? ` (${m.bots} bot${m.bots > 1 ? 's' : ''})` : ''}
                </span>
              </div>
              <button
                onClick={() => void entrarNa(m.id)}
                disabled={!conectado || m.jogadores >= m.maxJogadores}
              >
                {m.jogadores >= m.maxJogadores ? 'Cheia' : 'Sentar'}
              </button>
            </li>
          ))}
        </ul>
        <p className="dica">
          Ao sentar você recebe 100 big blinds em fichas virtuais. Para jogar sozinho, adicione bots
          na mesa.
        </p>
      </section>
    </main>
  );
}
