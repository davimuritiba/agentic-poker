/**
 * Conexão com o servidor do jogo (Socket.IO). É o "SDK do cliente" do documento, em
 * versão mínima: esconde o WebSocket e expõe estado e comandos para os componentes.
 */
import type {
  Acao,
  AnaliseDoCoach,
  EventosDoCliente,
  RecomendacaoDoCoach,
  EventosDoServidor,
  Resposta,
  ResumoDaMesa,
  VisaoDaMesa,
} from '@poker/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { lembrarMesa, mesaLembrada } from './identidade.js';

type SocketDoJogo = Socket<EventosDoServidor, EventosDoCliente>;

const SEM_CONEXAO: Resposta = { ok: false, motivo: 'Sem conexão com o servidor.' };

/**
 * Conecta quando há um usuário logado. O servidor confere a sessão pelo cookie, que o
 * navegador envia sozinho; se ela for recusada (expirou, por exemplo), chama `aoPerderSessao`.
 */
export function useConexao(usuarioId: string | null, aoPerderSessao: () => void) {
  const socket = useRef<SocketDoJogo | null>(null);
  const [conectado, setConectado] = useState(false);
  const [mesas, setMesas] = useState<ResumoDaMesa[]>([]);
  const [visao, setVisao] = useState<VisaoDaMesa | null>(null);
  const [socketAtual, setSocketAtual] = useState<SocketDoJogo | null>(null);
  const coach = useCoach(socketAtual);

  const perderSessao = useRef(aoPerderSessao);
  perderSessao.current = aoPerderSessao;

  useEffect(() => {
    if (!usuarioId) return;
    const s: SocketDoJogo = io();
    socket.current = s;
    setSocketAtual(s);

    s.on('connect', () => {
      setConectado(true);
      // Reconexão: volta para a mesa em que estava (o assento é mantido pelo servidor).
      const mesaId = mesaLembrada();
      if (mesaId) {
        void s.emitWithAck('mesa:entrar', { mesaId }).then((r) => {
          if (!r.ok) lembrarMesa(null);
        });
      }
    });
    s.on('disconnect', () => setConectado(false));
    s.on('connect_error', (erro) => {
      if (erro.message === 'nao-autenticado') {
        s.disconnect();
        perderSessao.current();
      }
    });
    s.on('lobby:mesas', setMesas);
    s.on('mesa:estado', setVisao);

    return () => {
      s.disconnect();
      socket.current = null;
      setSocketAtual(null);
      setConectado(false);
      setVisao(null);
      setMesas([]);
    };
  }, [usuarioId]);

  const entrar = useCallback(async (mesaId: string): Promise<Resposta> => {
    const s = socket.current;
    if (!s) return SEM_CONEXAO;
    const r = await s.emitWithAck('mesa:entrar', { mesaId });
    if (r.ok) lembrarMesa(mesaId);
    return r;
  }, []);

  const sair = useCallback(async (): Promise<Resposta> => {
    lembrarMesa(null);
    return socket.current ? socket.current.emitWithAck('mesa:sair') : SEM_CONEXAO;
  }, []);

  const adicionarBot = useCallback(
    async (): Promise<Resposta> =>
      socket.current ? socket.current.emitWithAck('mesa:adicionar-bot') : SEM_CONEXAO,
    [],
  );

  const agir = useCallback(
    async (acao: Acao): Promise<Resposta> =>
      socket.current ? socket.current.emitWithAck('mesa:acao', acao) : SEM_CONEXAO,
    [],
  );

  const pedirCoach = useCallback(
    async (): Promise<Resposta> =>
      socket.current ? socket.current.emitWithAck('coach:pedir') : SEM_CONEXAO,
    [],
  );

  return { conectado, mesas, visao, entrar, sair, adicionarBot, agir, pedirCoach, coach };
}

/** Últimos resultados do Coach IA recebidos do servidor. */
function useCoach(socket: SocketDoJogo | null) {
  const [analise, setAnalise] = useState<AnaliseDoCoach | null>(null);
  const [recomendacao, setRecomendacao] = useState<RecomendacaoDoCoach | null>(null);

  useEffect(() => {
    if (!socket) return;
    const aoAnalisar = (a: AnaliseDoCoach) => {
      setAnalise(a);
      setRecomendacao(null); // a recomendação desta análise ainda vai chegar
    };
    socket.on('coach:analise', aoAnalisar);
    socket.on('coach:recomendacao', setRecomendacao);
    return () => {
      socket.off('coach:analise', aoAnalisar);
      socket.off('coach:recomendacao', setRecomendacao);
    };
  }, [socket]);

  return { analise, recomendacao };
}
