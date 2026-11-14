import type {
  Acao,
  AnaliseDoCoach,
  Carta,
  EscritaDoCoach,
  JogadorVisivel,
  LeituraDoCoach,
  PedidoAoCoach,
  RecomendacaoDoCoach,
  Resposta,
  VisaoDaMesa,
} from '@poker/shared-types';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { descreverEvento, fichas } from '../formatacao.js';
import { alternarSom, useSomLigado, useSonsDaMesa } from '../sons.js';
import { BarraDeAcoes } from './BarraDeAcoes.js';
import { CartaVisual, EspacoDeCarta, chaveDaCarta } from './CartaVisual.js';
import { CoachIA } from './CoachIA.js';
import { CamadaDeFichas, PilhaDeFichas } from './Fichas.js';

interface Props {
  visao: VisaoDaMesa;
  agir: (acao: Acao) => Promise<Resposta>;
  sair: () => Promise<Resposta>;
  adicionarBot: () => Promise<Resposta>;
  pedirCoach: (pedido: PedidoAoCoach) => Promise<Resposta>;
  coach: {
    analise: AnaliseDoCoach | null;
    recomendacao: RecomendacaoDoCoach | null;
    leitura: LeituraDoCoach | null;
    escrita: EscritaDoCoach | null;
  };
}

/** Intervalo entre cartas que viram juntas (flop, cartas da mão); o som acompanha. */
export const INTERVALO_DO_FLOP = 120;

const mesmaCarta = (a: Carta, b: Carta) => a.valor === b.valor && a.naipe === b.naipe;

export function Mesa({ visao, agir, sair, adicionarBot, pedirCoach, coach }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const feltro = useRef<HTMLDivElement>(null);
  const somLigado = useSomLigado();
  useSonsDaMesa(visao, INTERVALO_DO_FLOP);
  const eu = visao.jogadores.find((j) => j.id === visao.voce?.id);
  const apostasNaRodada = visao.jogadores.reduce((soma, j) => soma + j.apostaNaRodada, 0);
  const vagas = visao.maxJogadores - visao.jogadores.length;

  // Cartas que formam as mãos vencedoras, para destacar no showdown.
  const vencedores = new Set(visao.resultado?.potes.flatMap((p) => p.vencedores) ?? []);
  const cartasVencedoras = Object.entries(visao.resultado?.maosReveladas ?? {})
    .filter(([id]) => vencedores.has(id))
    .flatMap(([, mao]) => mao.melhores);
  const destacar = (c: Carta) => cartasVencedoras.some((v) => mesmaCarta(v, c));

  const chamarBot = async () => {
    const r = await adicionarBot();
    setAviso(r.ok ? null : r.motivo);
  };

  return (
    <main className="tela-da-mesa">
      <div className="cabecalho-da-mesa">
        <div className="titulo-da-mesa">
          <h2>{visao.nome}</h2>
          <span className="detalhe">
            Blinds {fichas(visao.smallBlind)}/{fichas(visao.bigBlind)}
            {visao.numeroDaMao > 0 && ` · Mão #${visao.numeroDaMao}`}
          </span>
        </div>
        <div className="linha">
          <button
            className={somLigado ? 'fantasma botao-som' : 'fantasma botao-som mudo'}
            onClick={alternarSom}
            aria-pressed={somLigado}
            title={somLigado ? 'Desligar efeitos sonoros' : 'Ligar efeitos sonoros'}
          >
            ♪ Som
          </button>
          <button className="fantasma" onClick={() => void chamarBot()} disabled={vagas === 0}>
            + Bot
          </button>
          <button className="fantasma" onClick={() => void sair()}>
            Sair da mesa
          </button>
        </div>
      </div>
      {aviso && <p className="erro">{aviso}</p>}

      <div className="area-de-jogo">
        <div className="feltro" ref={feltro}>
          {visao.jogadores.map((j) => (
            <Assento
              key={j.id}
              jogador={j}
              posicao={posicaoNaTela(j.assento, eu?.assento ?? 0, visao.maxJogadores)}
              daVez={visao.vezDe === j.id}
              prazo={visao.vezDe === j.id ? visao.prazoDaVez : null}
              ganho={visao.resultado?.ganhos[j.id] ?? 0}
              descricao={visao.resultado?.maosReveladas[j.id]?.descricao}
              ehVoce={j.id === visao.voce?.id}
              destacar={destacar}
            />
          ))}

          {visao.jogadores
            .filter((j) => j.apostaNaRodada > 0)
            .map((j) => (
              <Aposta
                key={j.id}
                id={j.id}
                valor={j.apostaNaRodada}
                nome={j.nome}
                direcao={direcaoNaMesa(j.assento, eu?.assento ?? 0, visao.maxJogadores)}
              />
            ))}

          <div className="centro">
            <p className="pote" data-pote>
              {visao.fase === 'aguardando' ? (
                'Aguardando jogadores'
              ) : visao.fase === 'encerrada' ? (
                resumoDoResultado(visao)
              ) : (
                <>
                  <PilhaDeFichas valor={visao.pote} />
                  Pote: {fichas(visao.pote + apostasNaRodada)}
                </>
              )}
            </p>
            <div className="cartas-comunitarias">
              {Array.from({ length: 5 }, (_, i) => {
                const c = visao.cartasNaMesa[i];
                // O flop vira uma carta de cada vez; turn e river viram sozinhos.
                return c ? (
                  <CartaVisual
                    key={chaveDaCarta(c)}
                    carta={c}
                    destaque={destacar(c)}
                    animacao="virar"
                    atraso={i < 3 ? i * INTERVALO_DO_FLOP : 0}
                  />
                ) : (
                  <EspacoDeCarta key={`vazio-${i}`} />
                );
              })}
            </div>
          </div>

          <CamadaDeFichas visao={visao} feltro={feltro} />
        </div>

        {/* Logo abaixo da mesa, na mesma coluna: a barra lateral não empurra as ações. */}
        <div className="painel-do-jogador">
          {visao.voce?.acoes ? (
            <BarraDeAcoes
              acoes={visao.voce.acoes}
              poteTotal={visao.pote + apostasNaRodada}
              maiorAposta={visao.maiorAposta}
              agir={agir}
            />
          ) : (
            <p className="status">{mensagemDeStatus(visao, eu)}</p>
          )}
        </div>

        <div className="lateral">
          {eu && (
            <CoachIA
              visao={visao}
              analise={coach.analise}
              recomendacao={coach.recomendacao}
              leitura={coach.leitura}
              escrita={coach.escrita}
              pedirCoach={pedirCoach}
              agir={agir}
            />
          )}
          <Historico visao={visao} />
        </div>
      </div>
    </main>
  );
}

function Assento(props: {
  jogador: JogadorVisivel;
  posicao: { left: string; top: string };
  daVez: boolean;
  prazo: number | null;
  ganho: number;
  descricao: string | undefined;
  ehVoce: boolean;
  destacar: (c: Carta) => boolean;
}) {
  const { jogador: j, daVez, ganho, ehVoce } = props;
  const classes = [
    'assento',
    daVez && 'da-vez',
    ehVoce && 'voce',
    j.situacao === 'desistiu' && 'fora',
    ganho > 0 && 'ganhou',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={props.posicao} data-jogador={j.id}>
      <div className="cartas-do-jogador">
        {j.cartas
          ? j.cartas.map((c, i) => (
              <CartaVisual
                key={chaveDaCarta(c)}
                carta={c}
                pequena
                destaque={props.destacar(c)}
                animacao="virar"
                atraso={i * INTERVALO_DO_FLOP}
              />
            ))
          : Array.from({ length: j.quantidadeDeCartas }, (_, i) => (
              <CartaVisual
                key={`verso-${i}`}
                pequena
                animacao="dar"
                atraso={i * INTERVALO_DO_FLOP}
              />
            ))}
      </div>
      <div className="placa">
        <span className="nome">
          {j.nome}
          {j.ehBot && <span className="selo">BOT</span>}
          {!j.conectado && !j.ehBot && <span className="selo alerta">offline</span>}
        </span>
        <span className="stack">{fichas(j.stack)}</span>
        {j.situacao === 'all-in' && <span className="selo destaque">ALL-IN</span>}
        {j.situacao === 'desistiu' && <span className="estado">desistiu</span>}
        {j.situacao === 'aguardando' && <span className="estado">próxima mão</span>}
        {props.descricao && <span className="estado">{props.descricao}</span>}
        {ganho > 0 && <span className="ganho">+{fichas(ganho)}</span>}
        {props.prazo && <Cronometro prazo={props.prazo} />}
      </div>
      {j.ehBotao && (
        <span className="botao-dealer" title="Botão (dealer)">
          D
        </span>
      )}
    </div>
  );
}

function Cronometro({ prazo }: { prazo: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const segundos = Math.max(0, Math.ceil((prazo - agora) / 1000));
  return (
    <span
      className={segundos <= 5 ? 'cronometro acabando' : 'cronometro'}
      aria-label={`${segundos} segundos`}
    >
      {segundos}s
    </span>
  );
}

function Historico({ visao }: { visao: VisaoDaMesa }) {
  const fim = useRef<HTMLLIElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' });
  }, [visao.eventos.length]);

  return (
    <aside className="historico" aria-label="Histórico da mão">
      <h3>Histórico</h3>
      <ol aria-live="polite">
        {visao.eventos.map((ev, i) => (
          <li
            key={i}
            className={`evento-${ev.tipo}`}
            ref={i === visao.eventos.length - 1 ? fim : undefined}
          >
            {descreverEvento(ev, visao)}
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Direção do assento a partir do centro da mesa, com o próprio jogador sempre embaixo. */
function direcaoNaMesa(assento: number, meuAssento: number, total: number) {
  const relativo = (assento - meuAssento + total) % total;
  const angulo = Math.PI / 2 + (relativo * 2 * Math.PI) / total;
  return { cos: Math.cos(angulo), sin: Math.sin(angulo) };
}

/** Posição em volta da mesa oval. */
function posicaoNaTela(assento: number, meuAssento: number, total: number) {
  const { cos, sin } = direcaoNaMesa(assento, meuAssento, total);
  return { left: `${50 + 44 * cos}%`, top: `${50 + 40 * sin}%` };
}

/**
 * Fichas apostadas na rodada. Nos lugares laterais ficam entre o jogador e o centro (a
 * distância vem do CSS, para o celular poder aproximar); nos lugares de cima e de baixo
 * ficam ao lado do jogador, para não cobrir as cartas comunitárias nem as dele.
 */
function Aposta({
  id,
  valor,
  nome,
  direcao,
}: {
  id: string;
  valor: number;
  nome: string;
  direcao: { cos: number; sin: number };
}) {
  const vertical = Math.abs(direcao.cos) < 0.2;
  const estilo = vertical
    ? { top: `${50 + 40 * direcao.sin}%` }
    : ({ '--cos': direcao.cos, '--sin': direcao.sin } as CSSProperties);
  return (
    <span
      className={vertical ? 'aposta ao-lado' : 'aposta na-frente'}
      style={estilo}
      title={`Aposta de ${nome}`}
      data-aposta={id}
    >
      <PilhaDeFichas valor={valor} />
      {fichas(valor)}
    </span>
  );
}

function resumoDoResultado(visao: VisaoDaMesa): string {
  const ultimoPote = [...visao.eventos].reverse().find((e) => e.tipo === 'pote');
  return ultimoPote ? descreverEvento(ultimoPote, visao) : 'Mão encerrada';
}

function mensagemDeStatus(visao: VisaoDaMesa, eu: JogadorVisivel | undefined): string {
  if (!eu) return 'Você está assistindo.';
  if (visao.fase === 'aguardando') {
    return 'Aguardando mais jogadores. Chame alguém ou adicione um bot com "+ Bot".';
  }
  if (visao.fase === 'encerrada') return 'Próxima mão em instantes…';
  if (eu.situacao === 'aguardando') return 'Você entra na próxima mão.';
  if (eu.situacao === 'desistiu') return 'Você desistiu desta mão.';
  if (eu.situacao === 'all-in') return 'Você está all-in. Boa sorte!';
  const daVez = visao.jogadores.find((j) => j.id === visao.vezDe);
  return daVez ? `Vez de ${daVez.nome}…` : 'Aguarde…';
}
