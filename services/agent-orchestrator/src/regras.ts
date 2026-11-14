/**
 * Coach determinístico: escolhe uma jogada e escreve a leitura da mão só a partir dos
 * números da análise e do perfil. É usado quando a IA não está configurada, está ocupada,
 * demora demais ou responde algo inválido.
 */
import type {
  AnaliseDoCoach,
  LeituraDoCoach,
  PossibilidadeDeJogada,
  RecomendacaoDoCoach,
} from '@poker/shared-types';
import { PARAMETROS_DOS_PERFIS } from './analise.js';

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
  const p = PARAMETROS_DOS_PERFIS[a.perfil];
  // Pagar compensa na conta (equity ≥ pot odds)? O perfil seguro, mesmo assim, prefere
  // desistir quando a margem é pequena (decisão "neutra").
  const pagarCompensa = a.equityNecessaria === null || a.equity >= a.equityNecessaria;
  const prefereDesistir = a.perfil === 'seguro' || !pagarCompensa;
  const prioridade =
    a.equity >= p.subirBom
      ? ['aumentar', 'apostar', 'all-in', 'pagar', 'passar']
      : prefereDesistir
        ? ['passar', 'desistir', 'pagar', 'apostar', 'aumentar', 'all-in']
        : ['passar', 'pagar', 'desistir', 'apostar', 'aumentar', 'all-in'];
  const primeira = (avaliacao: PossibilidadeDeJogada['avaliacao']) =>
    prioridade
      .map((acao) => a.possibilidades.find((x) => x.acao === acao && x.avaliacao === avaliacao))
      .find(Boolean);
  const escolhida =
    primeira('boa') ??
    primeira('neutra') ??
    a.possibilidades.find((x) => x.acao === 'passar') ??
    a.possibilidades.find((x) => x.acao === 'desistir') ??
    (a.possibilidades[0] as PossibilidadeDeJogada);

  return {
    numeroDaMao: a.numeroDaMao,
    momento: a.momento,
    perfil: a.perfil,
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
      .filter((x) => x !== escolhida && x.avaliacao !== 'ruim')
      .slice(0, 2)
      .map((x) => ({ acao: x.acao, valor: x.valor, quando: x.motivo })),
    conceito:
      a.equityNecessaria !== null
        ? 'Pot odds: compare o preço de pagar com a sua chance de ganhar.'
        : 'Equity: a fatia do pote que a sua mão vale, em média.',
    ferramentasUsadas: ['calcular_equity', 'avaliar_possibilidades'],
    aviso,
  };
}

/**
 * Leitura da mão sem IA. O plano usa a conta das pot odds ao contrário: com equity e,
 * vale pagar uma aposta de até e/(1-e) do pote (ajustado pela margem do perfil).
 */
export function lerPorRegras(a: AnaliseDoCoach, aviso: string | null): LeituraDoCoach {
  const p = PARAMETROS_DOS_PERFIS[a.perfil];
  const equityUtil = Math.max(0, a.equity - Math.max(0, p.pagarBom));
  const pagariaAte =
    equityUtil >= 0.99 ? null : Math.floor((a.pote * equityUtil) / (1 - equityUtil));
  const melhorChance = a.chancesFinais[0];

  const plano =
    a.equity >= p.subirBom
      ? `Mão forte para o perfil ${a.perfil}: aposte ou aumente por valor quando for a sua vez.`
      : pagariaAte === null || pagariaAte <= 0
        ? 'Mão fraca: passe se puder e desista diante de apostas.'
        : `Se apostarem, pagar compensa até cerca de ${pagariaAte} fichas (pote atual: ${a.pote}).`;

  return {
    numeroDaMao: a.numeroDaMao,
    cartasNaMesa: a.cartasNaMesa,
    perfil: a.perfil,
    fonte: 'regras',
    modelo: null,
    leitura:
      `${a.maoAtual}: cerca de ${pct(a.equity)} de equity contra ${a.oponentes} adversário(s).` +
      (melhorChance && a.cartasNaMesa < 5
        ? ` Mais provável no river: ${melhorChance.mao} (${pct(melhorChance.chance)}).`
        : ''),
    plano,
    aviso,
  };
}

function rotulo(x: PossibilidadeDeJogada): string {
  const nomes = {
    desistir: 'Desistir',
    passar: 'Passar',
    pagar: 'Pagar',
    apostar: 'Apostar',
    aumentar: 'Aumentar',
    'all-in': 'All-in',
  };
  return x.valor !== null && x.acao !== 'pagar' ? `${nomes[x.acao]} ${x.valor}` : nomes[x.acao];
}
