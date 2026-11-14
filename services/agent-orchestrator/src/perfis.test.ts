import { cartas, type PerfilDoCoach, type VisaoDaMesa } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { semente, visaoNoFlop } from './__testes__/fixtures.js';
import { lerComOllama, type ChamarOllama, type MensagemOllama } from './agente-ollama.js';
import { analisar } from './analise.js';
import { montarContexto, type ContextoDoJogador } from './contexto.js';
import { ESQUEMA_DA_LEITURA, situacaoParaIA } from './ferramentas.js';
import { lerPorRegras, recomendarPorRegras } from './regras.js';

// Gerador novo a cada análise: resultados reproduzíveis, que não dependem da ordem dos testes.
const opcoes = () => ({ simulacoes: 4_000, aleatorio: semente(5) });

/** Mão do jogador no flop T-8-2, diante de uma aposta de 40 num pote de 80 (precisa de 33%). */
function visaoCom(mao: string): VisaoDaMesa {
  const base = visaoNoFlop();
  return {
    ...base,
    jogadores: base.jogadores.map((j) => (j.id === 'eu' ? { ...j, cartas: cartas(mao) } : j)),
    cartasNaMesa: cartas('Td 8s 2c'),
  };
}

function contexto(v: VisaoDaMesa, exigirVez = true): ContextoDoJogador {
  const r = montarContexto(v, { exigirVez });
  if (!r.ok) throw new Error(r.motivo);
  return r.contexto;
}

const analiseDe = (mao: string, perfil: PerfilDoCoach) =>
  analisar(contexto(visaoCom(mao)), opcoes(), perfil);
const avaliacaoDe = (mao: string, perfil: PerfilDoCoach, acao: string) =>
  analiseDe(mao, perfil).possibilidades.find((p) => p.acao === acao);
const recomendado = (mao: string, perfil: PerfilDoCoach) =>
  recomendarPorRegras(analiseDe(mao, perfil), null).acao;

describe('perfis do coach', () => {
  // Q-J (projeto de sequência, ~51%): aumentar é bom só para o agressivo.
  it('a mesma mão é avaliada de forma diferente em cada perfil', () => {
    expect(avaliacaoDe('Qh Jc', 'agressivo', 'aumentar')?.avaliacao).toBe('boa');
    expect(avaliacaoDe('Qh Jc', 'equilibrado', 'aumentar')?.avaliacao).toBe('neutra');
    expect(avaliacaoDe('Qh Jc', 'seguro', 'aumentar')?.avaliacao).toBe('ruim');
  });

  it('o agressivo aposta mais alto e o seguro mais baixo', () => {
    const tamanho = (p: PerfilDoCoach) => avaliacaoDe('9h 8c', p, 'aumentar')?.valor ?? 0;
    expect(tamanho('agressivo')).toBeGreaterThan(tamanho('equilibrado'));
    expect(tamanho('equilibrado')).toBeGreaterThan(tamanho('seguro'));
  });

  it('o coach por regras segue o perfil', () => {
    expect(recomendado('Qh Jc', 'agressivo')).toBe('aumentar');
    expect(recomendado('Qh Jc', 'equilibrado')).toBe('pagar');
    // K-5 (~38% contra 33% necessários): pagar compensa por pouco.
    expect(recomendado('Kh 5c', 'agressivo')).toBe('pagar');
    expect(recomendado('Kh 5c', 'equilibrado')).toBe('pagar');
    expect(recomendado('Kh 5c', 'seguro')).toBe('desistir');
  });

  it('o perfil vai para a IA, com o estilo de jogo', () => {
    const c = contexto(visaoCom('Qh Jc'));
    expect(situacaoParaIA(c, analisar(c, opcoes(), 'agressivo'))).toContain(
      'agressivo: tome a iniciativa',
    );
    expect(situacaoParaIA(c, analisar(c, opcoes(), 'seguro'))).toContain(
      'seguro: proteja as fichas',
    );
  });
});

describe('leitura da mão (fora da vez do jogador)', () => {
  const foraDaVez = (): VisaoDaMesa => ({
    ...visaoNoFlop(),
    vezDe: 'bot',
    voce: { id: 'eu', sentado: true, acoes: null },
  });

  it('só a recomendação exige a vez; a leitura vale a mão toda', () => {
    expect(montarContexto(foraDaVez())).toMatchObject({ ok: false });
    const c = contexto(foraDaVez(), false);
    expect(c.minhaVez).toBe(false);
    const a = analisar(c, opcoes());
    expect(a.modo).toBe('leitura');
    expect(a.possibilidades).toEqual([]);
    expect(a.maoAtual).toBe('Trinca de Ases');
  });

  it('jogador all-in também recebe leitura', () => {
    const v = foraDaVez();
    const allIn = {
      ...v,
      jogadores: v.jogadores.map((j) =>
        j.id === 'eu' ? { ...j, situacao: 'all-in' as const } : j,
      ),
    };
    expect(montarContexto(allIn, { exigirVez: false })).toMatchObject({ ok: true });
  });

  it('leitura por regras: descreve a mão e dá um plano no estilo do perfil', () => {
    const l = lerPorRegras(analisar(contexto(foraDaVez(), false), opcoes(), 'equilibrado'), null);
    expect(l).toMatchObject({
      fonte: 'regras',
      modelo: null,
      cartasNaMesa: 3,
      perfil: 'equilibrado',
    });
    expect(l.leitura).toMatch(/^Trinca de Ases: cerca de 9\d% de equity/);
    expect(l.plano).toMatch(/aposte ou aumente por valor/);
  });

  it('leitura com Ollama: uma chamada só, com os números e saída estruturada', async () => {
    const c = contexto(foraDaVez(), false);
    const a = analisar(c, opcoes(), 'seguro');
    const corpos: Record<string, unknown>[] = [];
    const chamar: ChamarOllama = async (corpo) => {
      corpos.push(corpo);
      return {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            leitura: 'Trinca de Ases, mão muito forte.',
            plano: 'Aposte por valor.',
          }),
        },
      };
    };

    const l = await lerComOllama(c, a, { chamar, modelo: 'qwen3:8b' });

    expect(l).toMatchObject({
      fonte: 'ia',
      modelo: 'qwen3:8b',
      perfil: 'seguro',
      leitura: 'Trinca de Ases, mão muito forte.',
    });
    expect(corpos).toHaveLength(1);
    expect(corpos[0]?.format).toEqual(ESQUEMA_DA_LEITURA);
    expect(corpos[0]?.tools).toBeUndefined();
    const pedido = (corpos[0]?.messages as MensagemOllama[]).at(-1)?.content ?? '';
    expect(pedido).toContain('equity_pct');
    expect(pedido).toContain('seguro: proteja as fichas');
  });

  it('leitura com Ollama fora do ar cai na leitura por regras', async () => {
    const c = contexto(foraDaVez(), false);
    const chamar: ChamarOllama = async () => {
      throw new TypeError('fetch failed');
    };
    const l = await lerComOllama(c, analisar(c, opcoes()), { chamar, modelo: 'm' });
    expect(l).toMatchObject({ fonte: 'regras', aviso: expect.stringMatching(/não está rodando/) });
  });
});
