import type { Acao, AcoesPermitidas, Resposta } from '@poker/shared-types';
import { useEffect, useState } from 'react';
import { fichas } from '../formatacao.js';

interface Props {
  acoes: AcoesPermitidas;
  /** Pote total, incluindo as apostas da rodada: base para os atalhos de tamanho. */
  poteTotal: number;
  maiorAposta: number;
  agir: (acao: Acao) => Promise<Resposta>;
}

export function BarraDeAcoes({ acoes, poteTotal, maiorAposta, agir }: Props) {
  const intervalo = acoes.apostar ?? acoes.aumentar;
  const tipoDeSubida = acoes.apostar ? 'apostar' : 'aumentar';
  const [valor, setValor] = useState(intervalo?.minimo ?? 0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Nova decisão: volta o valor para o mínimo.
  useEffect(() => {
    setValor(intervalo?.minimo ?? 0);
    setErro(null);
  }, [intervalo?.minimo, intervalo?.maximo]);

  const enviar = async (acao: Acao) => {
    setEnviando(true);
    setErro(null);
    const r = await agir(acao);
    setEnviando(false);
    if (!r.ok) setErro(r.motivo);
  };

  const limitar = (v: number) =>
    intervalo ? Math.min(Math.max(Math.round(v), intervalo.minimo), intervalo.maximo) : v;
  const atalhos = intervalo
    ? [
        { rotulo: 'Mín.', valor: intervalo.minimo },
        { rotulo: '½ pote', valor: limitar(maiorAposta + poteTotal / 2) },
        { rotulo: 'Pote', valor: limitar(maiorAposta + poteTotal) },
      ]
    : [];

  return (
    <div className="barra-de-acoes" role="group" aria-label="Sua jogada">
      <div className="botoes">
        {acoes.desistir && (
          <button
            className="desistir"
            disabled={enviando}
            onClick={() => void enviar({ tipo: 'desistir' })}
          >
            Desistir
          </button>
        )}
        {acoes.passar && (
          <button disabled={enviando} onClick={() => void enviar({ tipo: 'passar' })}>
            Passar
          </button>
        )}
        {acoes.pagar !== undefined && (
          <button disabled={enviando} onClick={() => void enviar({ tipo: 'pagar' })}>
            Pagar {fichas(acoes.pagar)}
          </button>
        )}
        {intervalo && (
          <button
            className="subir"
            disabled={enviando}
            onClick={() => void enviar({ tipo: tipoDeSubida, valor })}
          >
            {tipoDeSubida === 'apostar' ? 'Apostar' : 'Aumentar para'} {fichas(valor)}
          </button>
        )}
        {acoes.allIn !== undefined && (
          <button
            className="all-in"
            disabled={enviando}
            onClick={() => void enviar({ tipo: 'all-in' })}
          >
            All-in ({fichas(acoes.allIn)})
          </button>
        )}
      </div>

      {intervalo && intervalo.maximo > intervalo.minimo && (
        <div className="valor-da-aposta">
          {atalhos.map((a) => (
            <button key={a.rotulo} className="atalho" onClick={() => setValor(a.valor)}>
              {a.rotulo}
            </button>
          ))}
          <input
            type="range"
            min={intervalo.minimo}
            max={intervalo.maximo}
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            aria-label="Valor da aposta"
          />
          <input
            type="number"
            min={intervalo.minimo}
            max={intervalo.maximo}
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            onBlur={() => setValor(limitar(valor))}
            aria-label="Valor da aposta em fichas"
          />
        </div>
      )}

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
