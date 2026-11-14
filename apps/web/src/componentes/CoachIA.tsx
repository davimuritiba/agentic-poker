import {
  DESCRICOES_DOS_PERFIS,
  NOMES_DOS_PERFIS,
  type Acao,
  type AcaoSugerida,
  type AnaliseDoCoach,
  type EscritaDoCoach,
  type LeituraDoCoach,
  type ModoDoCoach,
  type PedidoAoCoach,
  type PerfilDoCoach,
  type RecomendacaoDoCoach,
  type Resposta,
  type VisaoDaMesa,
} from '@poker/shared-types';
import { useEffect, useRef, useState } from 'react';
import { fichas } from '../formatacao.js';
import { lerPerfil } from '../perfilDoCoach.js';

interface Props {
  visao: VisaoDaMesa;
  analise: AnaliseDoCoach | null;
  recomendacao: RecomendacaoDoCoach | null;
  leitura: LeituraDoCoach | null;
  /** O que a IA está escrevendo agora, ao vivo. */
  escrita: EscritaDoCoach | null;
  pedirCoach: (pedido: PedidoAoCoach) => Promise<Resposta>;
  agir: (acao: Acao) => Promise<Resposta>;
}

const ACOES_VALIDAS: readonly string[] = [
  'desistir',
  'passar',
  'pagar',
  'apostar',
  'aumentar',
  'all-in',
];

const prefereMenosMovimento = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Efeito de digitação: revela os textos aos poucos, um depois do outro, como se a IA
 * estivesse escrevendo. Usado quando a resposta chega pronta (coach por regras, Claude, ou
 * resposta guardada); quando a IA escreveu ao vivo, o texto já foi visto e aparece inteiro.
 */
function useDigitacao(textos: readonly string[], ativo: boolean, porSegundo = 90) {
  const total = textos.reduce((soma, t) => soma + t.length, 0);
  const [revelados, setRevelados] = useState(ativo ? 0 : total);
  const assinatura = textos.join('\u0000');

  useEffect(() => {
    if (!ativo || prefereMenosMovimento()) {
      setRevelados(total);
      return;
    }
    setRevelados(0);
    const inicio = performance.now();
    const id = setInterval(() => {
      const agora = Math.min(total, Math.floor(((performance.now() - inicio) / 1000) * porSegundo));
      setRevelados(agora);
      if (agora >= total) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
    // A assinatura representa os textos; reiniciar só quando eles mudam.
  }, [assinatura, ativo, total, porSegundo]);

  let resto = revelados;
  const partes = textos.map((t) => {
    const parte = t.slice(0, Math.max(0, resto));
    resto -= t.length;
    return parte;
  });
  return { partes, digitando: revelados < total };
}

/** Cursor piscando no fim do texto que está sendo escrito. */
const Cursor = () => <span className="cursor-ia" aria-hidden="true" />;

const CHAVE_AUTOMATICO = 'poker:coachAutomatico';
const pct = (x: number) => `${Math.round(x * 100)}%`;

function lerDoNavegador(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarNoNavegador(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento: vale só nesta aba
  }
}

/** A análise em tempo real vem ligada; só fica desligada se o jogador desligar. */
const lerAutomatico = () => lerDoNavegador(CHAVE_AUTOMATICO) !== 'nao';

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

export function CoachIA({
  visao,
  analise,
  recomendacao,
  leitura,
  escrita,
  pedirCoach,
  agir,
}: Props) {
  const [automatico, setAutomatico] = useState(lerAutomatico);
  // O tipo de coach é escolhido no menu inicial; aqui ele só é mostrado.
  const [perfil] = useState(lerPerfil);
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperando, setEsperando] = useState<ModoDoCoach | null>(null);
  const ultimoPedido = useRef<string | null>(null);

  const eu = visao.jogadores.find((j) => j.id === visao.voce?.id);
  const emAndamento = visao.fase !== 'aguardando' && visao.fase !== 'encerrada';
  const euNaMao =
    emAndamento && !!eu?.cartas && (eu.situacao === 'ativo' || eu.situacao === 'all-in');
  const minhaVez = visao.voce?.acoes != null;
  const momento = visao.eventos.length;
  const cartasNaMesa = visao.cartasNaMesa.length;
  const oponentes = visao.jogadores.filter(
    (j) => j.id !== eu?.id && (j.situacao === 'ativo' || j.situacao === 'all-in'),
  ).length;

  // Só vale o que foi calculado para esta mão, este perfil e este momento:
  // a decisão atual (na vez do jogador) ou a etapa atual da mão (fora da vez).
  const mesmaMao = (x: { numeroDaMao: number; perfil: PerfilDoCoach } | null) =>
    !!x && x.numeroDaMao === visao.numeroDaMao && x.perfil === perfil;
  const analiseAtual =
    mesmaMao(analise) &&
    analise &&
    (minhaVez
      ? analise.modo === 'decisao' && analise.momento === momento
      : analise.modo === 'leitura' && analise.cartasNaMesa === cartasNaMesa)
      ? analise
      : null;
  const recomendacaoAtual =
    minhaVez && mesmaMao(recomendacao) && recomendacao?.momento === momento ? recomendacao : null;
  const leituraAtual =
    !minhaVez && mesmaMao(leitura) && leitura?.cartasNaMesa === cartasNaMesa ? leitura : null;
  const escritaAtual =
    mesmaMao(escrita) &&
    escrita &&
    (minhaVez
      ? escrita.modo === 'decisao' && escrita.momento === momento
      : escrita.modo === 'leitura' && escrita.cartasNaMesa === cartasNaMesa)
      ? escrita
      : null;

  // Respostas cujo texto o jogador já viu sendo escrito ao vivo: não precisam ser
  // "digitadas" de novo quando a versão final chega.
  const chaveDaVez = minhaVez
    ? `d:${visao.numeroDaMao}:${momento}:${perfil}`
    : `l:${visao.numeroDaMao}:${cartasNaMesa}:${perfil}`;
  const escritasAoVivo = useRef(new Set<string>());
  if (escritaAtual && Object.keys(escritaAtual.texto).length > 0) {
    escritasAoVivo.current.add(chaveDaVez);
  }
  const digitar = !escritasAoVivo.current.has(chaveDaVez);

  // Muda para disparar de novo o pedido automático que o servidor recusou por estar ocupado.
  const [tentativa, setTentativa] = useState(0);

  const pedir = async (modo: ModoDoCoach, automatico = false) => {
    setAviso(null);
    setEsperando(modo);
    const r = await pedirCoach({ modo, perfil });
    if (r.ok) return;
    if (automatico) {
      // O coach ainda trabalha num pedido anterior (por exemplo, ao trocar de perfil no meio
      // da decisão): tenta de novo em instantes, enquanto a situação for a mesma.
      ultimoPedido.current = null;
      setTimeout(() => setTentativa((n) => n + 1), 2_000);
      return;
    }
    setAviso(r.motivo);
    setEsperando(null);
  };

  useEffect(() => {
    if (recomendacaoAtual || leituraAtual) setEsperando(null);
  }, [recomendacaoAtual, leituraAtual]);

  // Tempo real: na vez do jogador, analisa a decisão; fora dela, lê a mão a cada etapa
  // (carta nova, alguém desiste, outro perfil).
  useEffect(() => {
    if (!automatico || !euNaMao) return;
    const chave = minhaVez
      ? `decisao:${visao.numeroDaMao}:${momento}:${perfil}`
      : `leitura:${visao.numeroDaMao}:${cartasNaMesa}:${oponentes}:${perfil}`;
    if (ultimoPedido.current === chave) return;
    ultimoPedido.current = chave;
    void pedir(minhaVez ? 'decisao' : 'leitura', true);
  }, [
    automatico,
    euNaMao,
    minhaVez,
    visao.numeroDaMao,
    momento,
    cartasNaMesa,
    oponentes,
    perfil,
    tentativa,
  ]);

  useEffect(() => {
    if (!euNaMao) setEsperando(null);
  }, [euNaMao]);

  const alternarAutomatico = (ligado: boolean) => {
    setAutomatico(ligado);
    gravarNoNavegador(CHAVE_AUTOMATICO, ligado ? 'sim' : 'nao');
  };

  return (
    <section className="coach" aria-label="Coach IA">
      <div className="coach-topo">
        <h3>
          <span aria-hidden="true">🤖</span> Coach IA
        </h3>
        <label className="interruptor" title="Analisa sozinho a cada decisão e a cada carta nova">
          <input
            type="checkbox"
            checked={automatico}
            onChange={(e) => alternarAutomatico(e.target.checked)}
          />
          Tempo real
        </label>
      </div>

      <p className="coach-perfil" title={DESCRICOES_DOS_PERFIS[perfil]}>
        Tipo: <strong>{NOMES_DOS_PERFIS[perfil]}</strong>
        <span className="detalhe"> · troque no menu inicial</span>
      </p>

      {!euNaMao && !analiseAtual && (
        <p className="coach-dica">
          Durante a mão, o coach analisa usando só o que você vê: suas cartas e as da mesa.
        </p>
      )}
      {euNaMao && !analiseAtual && esperando === null && (
        <button
          className="coach-pedir"
          onClick={() => void pedir(minhaVez ? 'decisao' : 'leitura')}
        >
          {minhaVez ? 'Analisar minha jogada' : 'Ler minha mão'}
        </button>
      )}
      {euNaMao && !analiseAtual && esperando !== null && (
        <p className="coach-pensando" role="status">
          Calculando…
        </p>
      )}
      {aviso && <p className="erro">{aviso}</p>}

      {analiseAtual && <Numeros analise={analiseAtual} />}

      {analiseAtual &&
        analiseAtual.modo === 'leitura' &&
        !leituraAtual &&
        (escritaAtual ? (
          <AoVivo escrita={escritaAtual} />
        ) : (
          <p className="coach-pensando" role="status">
            A IA está lendo a sua mão…
          </p>
        ))}
      {leituraAtual && <Leitura l={leituraAtual} digitar={digitar} />}

      {analiseAtual &&
        analiseAtual.modo === 'decisao' &&
        !recomendacaoAtual &&
        (escritaAtual ? (
          <AoVivo escrita={escritaAtual} />
        ) : (
          <p className="coach-pensando" role="status">
            O agente está consultando as ferramentas…
          </p>
        ))}
      {recomendacaoAtual && (
        <Recomendacao
          r={recomendacaoAtual}
          digitar={digitar}
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

      {a.possibilidades.length > 0 && (
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
      )}
    </div>
  );
}

/**
 * A IA trabalhando, ao vivo: os passos do agente (ferramentas que usou) e o texto da
 * resposta aparecendo enquanto o modelo gera, com um cursor no ponto em que ele está.
 */
function AoVivo({ escrita }: { escrita: EscritaDoCoach }) {
  const t = escrita.texto;
  const campos =
    escrita.modo === 'decisao'
      ? [
          { nome: 'resumo', texto: t.resumo, classe: 'recomendacao-resumo' },
          { nome: 'explicacao', texto: t.explicacao, classe: '' },
          { nome: 'conceito', texto: t.conceito, classe: 'conceito' },
        ]
      : [
          { nome: 'leitura', texto: t.leitura, classe: 'recomendacao-resumo' },
          { nome: 'plano', texto: t.plano, classe: '' },
        ];
  const comTexto = campos.filter((c) => c.texto);
  const ultimo = comTexto.at(-1)?.nome;
  const acao = t.acao && ACOES_VALIDAS.includes(t.acao) ? (t.acao as AcaoSugerida) : null;

  return (
    // Sem aria-live aqui: leitores de tela leriam cada pedaço. A resposta final é anunciada.
    <div className="recomendacao ao-vivo" aria-busy="true">
      <p className="recomendacao-fonte">
        <span className="pena" aria-hidden="true">
          ✍️
        </span>{' '}
        {comTexto.length > 0 ? 'A IA está escrevendo…' : 'O agente está trabalhando…'}
      </p>
      {escrita.etapas.length > 0 && (
        <ol className="etapas-do-agente">
          {escrita.etapas.map((etapa, i) => (
            <li
              key={i}
              className={
                i === escrita.etapas.length - 1 && comTexto.length === 0 ? 'atual' : 'feita'
              }
            >
              {etapa}
            </li>
          ))}
        </ol>
      )}
      {acao && escrita.modo === 'decisao' && (
        <p className="jogada-ao-vivo">
          Jogada: <strong>{rotuloDaJogada(acao, t.valor ?? null)}</strong>
        </p>
      )}
      {comTexto.map((c) => (
        <p key={c.nome} className={c.classe || undefined}>
          {c.nome === 'plano' && <strong>Plano: </strong>}
          {c.nome === 'conceito' && <span aria-hidden="true">💡 </span>}
          {c.texto}
          {c.nome === ultimo && <Cursor />}
        </p>
      ))}
      {comTexto.length === 0 && escrita.etapas.length === 0 && <Cursor />}
    </div>
  );
}

function Leitura({ l, digitar }: { l: LeituraDoCoach; digitar: boolean }) {
  const { partes, digitando } = useDigitacao([l.leitura, l.plano], digitar);
  const [leitura = '', plano = ''] = partes;
  return (
    <div className="recomendacao leitura" role="status">
      <p className="recomendacao-fonte">
        {l.fonte === 'ia' ? `Leitura da IA (${l.modelo ?? 'IA'})` : 'Leitura por regras'} · perfil{' '}
        {NOMES_DOS_PERFIS[l.perfil].toLowerCase()}
      </p>
      <p className="recomendacao-resumo">
        {leitura}
        {digitando && !plano && <Cursor />}
      </p>
      {plano && (
        <p>
          <strong>Plano:</strong> {plano}
          {digitando && <Cursor />}
        </p>
      )}
      {l.aviso && !digitando && <p className="coach-rodape">{l.aviso}</p>}
    </div>
  );
}

function Recomendacao(props: {
  r: RecomendacaoDoCoach;
  digitar: boolean;
  podeAplicar: boolean;
  aplicar: () => Promise<void>;
}) {
  const { r } = props;
  const { partes, digitando } = useDigitacao([r.resumo, r.explicacao, r.conceito], props.digitar);
  const [resumo = '', explicacao = '', conceito = ''] = partes;
  const emDigitacao = (proximo: string) => digitando && !proximo;
  return (
    <div className="recomendacao" role="status">
      <p className="recomendacao-fonte">
        {r.fonte === 'ia' ? `Recomendação da IA (${r.modelo ?? 'IA'})` : 'Recomendação por regras'}{' '}
        · confiança {r.confianca}
      </p>
      <p className="recomendacao-resumo">
        {resumo}
        {emDigitacao(explicacao) && <Cursor />}
      </p>
      {explicacao && (
        <p>
          {explicacao}
          {emDigitacao(conceito) && <Cursor />}
        </p>
      )}
      {digitando ? null : <RestoDaRecomendacao {...props} />}
      {digitando && conceito && (
        <p className="conceito">
          <span aria-hidden="true">💡</span> {conceito}
          <Cursor />
        </p>
      )}
    </div>
  );
}

/** Alternativas, conceito e botão: aparecem quando o texto principal terminou de ser escrito. */
function RestoDaRecomendacao(props: {
  r: RecomendacaoDoCoach;
  podeAplicar: boolean;
  aplicar: () => Promise<void>;
}) {
  const { r } = props;
  return (
    <>
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
    </>
  );
}
