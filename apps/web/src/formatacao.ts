import type { Carta, EventoDaMao, Naipe, Valor, VisaoDaMesa } from '@poker/shared-types';

const LETRA: Partial<Record<Valor, string>> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const NOME_DO_VALOR: Partial<Record<Valor, string>> = {
  11: 'Valete',
  12: 'Dama',
  13: 'Rei',
  14: 'Ás',
};

export const SIMBOLO: Record<Naipe, string> = { paus: '♣', ouros: '♦', copas: '♥', espadas: '♠' };

export const letraDoValor = (v: Valor) => LETRA[v] ?? String(v);
export const ehVermelha = (c: Carta) => c.naipe === 'copas' || c.naipe === 'ouros';
export const textoDaCarta = (c: Carta) => letraDoValor(c.valor) + SIMBOLO[c.naipe];
export const nomeDaCarta = (c: Carta) => `${NOME_DO_VALOR[c.valor] ?? c.valor} de ${c.naipe}`;
export const fichas = (n: number) => n.toLocaleString('pt-BR');

const VERBO = {
  desistir: 'desiste',
  passar: 'passa',
  pagar: 'paga',
  apostar: 'aposta',
  aumentar: 'aumenta para',
} as const;

const FASE = { flop: 'Flop', turn: 'Turn', river: 'River' } as const;

/** Uma linha do histórico da mão. */
export function descreverEvento(ev: EventoDaMao, visao: VisaoDaMesa): string {
  const nome = (id: string) => visao.jogadores.find((j) => j.id === id)?.nome ?? 'Alguém que saiu';
  switch (ev.tipo) {
    case 'inicio':
      return `Mão #${visao.numeroDaMao} começou. Botão: ${nome(ev.botao)}.`;
    case 'blind':
      return `${nome(ev.jogadorId)} posta o ${ev.qual} blind (${fichas(ev.valor)}).`;
    case 'acao': {
      const valor =
        ev.acao === 'pagar' || ev.acao === 'apostar' || ev.acao === 'aumentar'
          ? ` ${fichas(ev.apostaTotal)}`
          : '';
      return `${nome(ev.jogadorId)} ${VERBO[ev.acao]}${valor}${ev.allIn ? ' (all-in)' : ''}.`;
    }
    case 'cartas':
      return `${FASE[ev.fase]}: ${ev.cartas.map(textoDaCarta).join(' ')}`;
    case 'showdown':
      return `${nome(ev.jogadorId)} mostra ${ev.cartas.map(textoDaCarta).join(' ')}: ${ev.descricao}.`;
    case 'pote': {
      const quem = ev.vencedores.map(nome).join(' e ');
      const verbo = ev.vencedores.length > 1 ? 'dividem' : 'ganha';
      return `${quem} ${verbo} ${fichas(ev.valor)}${ev.descricao ? ` com ${ev.descricao}` : ''}.`;
    }
  }
}
