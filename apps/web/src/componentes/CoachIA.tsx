import type {
  Acao,
  AcaoSugerida,
  AnaliseDoCoach,
  RecomendacaoDoCoach,
  Resposta,
  VisaoDaMesa,
} from '@poker/shared-types';
import { useEffect, useRef, useState } from 'react';
import { fichas } from '../formatacao.js';

interface Props {
  visao: VisaoDaMesa;
  analise: AnaliseDoCoach | null;
  recomendacao: RecomendacaoDoCoach | null;
  pedirCoach: () => Promise<Resposta>;
  agir: (acao: Acao) => Promise<Resposta>;
}

const CHAVE_AUTOMATICO = 'poker:coachAutomatico';
const pct = (x: number) => `${Math.round(x * 100)}%`;

function lerAutomatico(): boolean {
  try {
    return localStorage.getItem(CHAVE_AUTOMATICO) === 'sim';
  } catch {
    return false;
  }
}

export function rotuloDaJogada(acao: AcaoSugerida, valor: number | null): string {
  switch (acao) {
    case 'desistir':
      return 'Desistir';
    case 'passar':
      return 'Passar';
    case 'pagar':
      return 'Pagar';
    case 'apostar':
      return `Apostar ${fichas(valor ?? 0)}`;
    case 'aumentar':
      return `Aumentar para ${fichas(valor ?? 0)}`;
    case 'all-in':
      return `All-in (${fichas(valor ?? 0)})`;
  }
}

function paraAcao(acao: AcaoSugerida, valor: number | null): Acao {
  if (acao === 'apostar' || acao === 'aumentar') return { tipo: acao, valor: valor ?? 0 };
  return { tipo: acao };
}

export function CoachIA({ visao, analise, recomendacao, pedirCoach, agir }: Props) {
  const [automatico, setAutomatico] = useState(lerAutomatico);
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const pedidoAutomatico = useRef<string | null>(null);

  const minhaVez = visao.voce?.acoes != null;
  const momento = visao.eventos.length;
  // Análises de uma decisão anterior não valem mais.
  const atual = (x: { numeroDaMao: number; momento: number } | null) =>
    x && x.numeroDaMao === visao.numeroDaMao && x.momento === momento ? x : null;
  const analiseAtual = atual(analise) as AnaliseDoCoach | null;
  const recomendacaoAtual = atual(recomendacao) as RecomendacaoDoCoach | null;

  const pedir = async () => {
    setAviso(null);
    setEsperando(true);
    const r = await pedirCoach();
    if (!r.ok) {
      setAviso(r.motivo);
      setEsperando(false);
    }
  };

  useEffect(() => {
    if (recomendacaoAtual) setEsperando(false);
  }, [recomendacaoAtual]);

  // Modo automático: pede uma análise a cada nova decisão do jogador.
  useEffect(() => {
    const chave = `${visao.numeroDaMao}:${momento}`;
    if (automatico && minhaVez && pedidoAutomatico.current !== chave) {
      pedidoAutomatico.current = chave;
      void pedir();
    }
    if (!minhaVez) setEsperando(false);
  }, [automatico, minhaVez, visao.numeroDaMao, momento]);

  const alternarAutomatico = (ligado: boolean) => {
    setAutomatico(ligado);
    try {
      localStorage.setItem(CHAVE_AUTOMATICO, ligado ? 'sim' : 'nao');
    } catch {
      // sem armazenamento: vale só nesta aba
    }
  };

  return (
    <section className="coach" aria-label="Coach IA">
      <div className="coach-topo">
        <h3>
          <span aria-hidden="true">🤖</span> Coach IA
        </h3>
        <label className="interruptor">
          <input
            type="checkbox"
            checked={automatico}
            onChange={(e) => alternarAutomatico(e.target.checked)}
          />
          Automático
        </label>
      </div>

      {!minhaVez && !analiseAtual && (
        <p className="coach-dica">Na sua vez, o coach analisa a jogada usando só o que você vê.</p>
      )}
      {minhaVez && !analiseAtual && (
        <button className="coach-pedir" onClick={() => void pedir()} disabled={esperando}>
          {esperando ? 'Analisando…' : 'Analisar minha jogada'}
        </button>
      )}
      {aviso && <p className="erro">{aviso}</p>}

      {analiseAtual && <Numeros analise={analiseAtual} />}

      {analiseAtual && !recomendacaoAtual && (
        <p className="coach-pensando" role="status">
          O agente está consultando as ferramentas…
        </p>
      )}
      {recomendacaoAtual && (
        <Recomendacao
          r={recomendacaoAtual}
          podeAplicar={minhaVez}
          aplicar={async () => {
            const resposta = await agir(paraAcao(recomendacaoAtual.acao, recomendacaoAtual.valor));
            if (!resposta.ok) setAviso(resposta.motivo);
          }}
        />
      )}
    </section>
  );
}

function Numeros({ analise: a }: { analise: AnaliseDoCoach }) {
  return (
    <div className="coach-numeros">
      <p className="coach-mao">
        <strong>{a.maoAtual}</strong> · {a.posicao}
      </p>

      <div
        className="barra-equity"
        role="img"
        aria-label={`Vitória ${pct(a.vitoria)}, empate ${pct(a.empate)}`}
      >
        <span className="vitoria" style={{ width: pct(a.vitoria) }} />
        <span className="empate" style={{ width: pct(a.empate) }} />
      </div>
      <p className="coach-legenda">
        Equity <strong>{pct(a.equity)}</strong> contra {a.oponentes}{' '}
        {a.oponentes === 1 ? 'mão aleatória' : 'mãos aleatórias'} ({fichas(a.simulacoes)}{' '}
        simulações)
      </p>

      {a.equityNecessaria !== null && (
        <p className="coach-legenda">
          Pagar {fichas(a.paraPagar)} num pote de {fichas(a.pote)} exige{' '}
          <strong>{pct(a.equityNecessaria)}</strong> de equity
          {a.equity >= a.equityNecessaria
            ? ' — você tem o suficiente.'
            : ' — você tem menos que isso.'}
        </p>
      )}

      {a.chancesFinais.length > 0 && (
        <p className="coach-legenda">
          No river: {a.chancesFinais.map((c) => `${c.mao} ${pct(c.chance)}`).join(' · ')}
        </p>
      )}

      <ul className="possibilidades">
        {a.possibilidades.map((p) => (
          <li key={p.acao} className={`avaliacao-${p.avaliacao}`}>
            <span className="selo-avaliacao">{p.avaliacao}</span>
            <span>
              <strong>{rotuloDaJogada(p.acao, p.valor)}</strong> — {p.motivo}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Recomendacao(props: {
  r: RecomendacaoDoCoach;
  podeAplicar: boolean;
  aplicar: () => Promise<void>;
}) {
  const { r } = props;
  return (
    <div className="recomendacao">
      <p className="recomendacao-fonte">
        {r.fonte === 'ia' ? 'Recomendação da IA (Claude)' : 'Recomendação por regras'} · confiança{' '}
        {r.confianca}
      </p>
      <p className="recomendacao-resumo">{r.resumo}</p>
      {r.explicacao && <p>{r.explicacao}</p>}
      {r.alternativas.length > 0 && (
        <ul className="alternativas">
          {r.alternativas.map((alt) => (
            <li key={alt.acao}>
              <strong>{rotuloDaJogada(alt.acao, alt.valor)}</strong>: {alt.quando}
            </li>
          ))}
        </ul>
      )}
      {r.conceito && (
        <p className="conceito">
          <span aria-hidden="true">💡</span> {r.conceito}
        </p>
      )}
      {props.podeAplicar && (
        <button className="subir" onClick={() => void props.aplicar()}>
          Seguir a sugestão: {rotuloDaJogada(r.acao, r.valor)}
        </button>
      )}
      <p className="coach-rodape">
        Ferramentas usadas: {r.ferramentasUsadas.join(', ')}
        {r.aviso && <> · {r.aviso}</>}
      </p>
    </div>
  );
}
