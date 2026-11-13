/**
 * Coach determinístico: escolhe uma jogada só a partir dos números da análise.
 * É usado quando a IA não está configurada, demora demais ou responde algo inválido.
 */
import type {
  AnaliseDoCoach,
  PossibilidadeDeJogada,
  RecomendacaoDoCoach,
} from '@poker/shared-types';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Confiança pela distância entre a equity e o limite da decisão (o necessário para pagar
 * ou, sem aposta a pagar, 50%): longe do limite = decisão clara.
 */
export function confiancaPelaMargem(a: AnaliseDoCoach): 'baixa' | 'media' | 'alta' {
  const limite = a.equityNecessaria ?? 0.5;
  const margem = Math.abs(a.equity - limite);
  return margem >= 0.15 ? 'alta' : margem >= 0.05 ? 'media' : 'baixa';
}

export function recomendarPorRegras(a: AnaliseDoCoach, aviso: string | null): RecomendacaoDoCoach {
  const boas = a.possibilidades.filter((p) => p.avaliacao === 'boa');
  const prioridade =
    a.equity >= 0.6
      ? ['aumentar', 'apostar', 'all-in', 'pagar', 'passar']
      : ['passar', 'pagar', 'desistir', 'apostar', 'aumentar', 'all-in'];
  const escolhida =
    prioridade.map((acao) => boas.find((p) => p.acao === acao)).find(Boolean) ??
    a.possibilidades.find((p) => p.avaliacao === 'neutra') ??
    a.possibilidades.find((p) => p.acao === 'passar') ??
    a.possibilidades.find((p) => p.acao === 'desistir') ??
    (a.possibilidades[0] as PossibilidadeDeJogada);

  return {
    numeroDaMao: a.numeroDaMao,
    momento: a.momento,
    fonte: 'regras',
    modelo: null,
    acao: escolhida.acao,
    valor: escolhida.valor,
    confianca: confiancaPelaMargem(a),
    resumo: `${rotulo(escolhida)}: ${escolhida.motivo}`,
    explicacao:
      `Você tem ${a.maoAtual} e cerca de ${pct(a.equity)} de equity contra ${a.oponentes} ` +
      `mão(s) aleatória(s).` +
      (a.equityNecessaria !== null
        ? ` Para pagar ${a.paraPagar} num pote de ${a.pote}, é preciso ganhar pelo menos ${pct(a.equityNecessaria)} das vezes.`
        : ' Não há aposta a pagar.'),
    alternativas: a.possibilidades
      .filter((p) => p !== escolhida && p.avaliacao !== 'ruim')
      .slice(0, 2)
      .map((p) => ({ acao: p.acao, valor: p.valor, quando: p.motivo })),
    conceito:
      a.equityNecessaria !== null
        ? 'Pot odds: compare o preço de pagar com a sua chance de ganhar.'
        : 'Equity: a fatia do pote que a sua mão vale, em média.',
    ferramentasUsadas: ['calcular_equity', 'avaliar_possibilidades'],
    aviso,
  };
}

function rotulo(p: PossibilidadeDeJogada): string {
  const nomes = {
    desistir: 'Desistir',
    passar: 'Passar',
    pagar: 'Pagar',
    apostar: 'Apostar',
    aumentar: 'Aumentar',
    'all-in': 'All-in',
  };
  return p.valor !== null && p.acao !== 'pagar' ? `${nomes[p.acao]} ${p.valor}` : nomes[p.acao];
}
