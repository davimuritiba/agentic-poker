import type { EscritaDoCoach } from '@poker/shared-types';
import { describe, expect, it } from 'vitest';
import { LimiteDoCoach, lerPedidoAoCoach, lerRespostaAoVivo } from './coach.js';

describe('lerRespostaAoVivo', () => {
  const escrita = (resumo: string): EscritaDoCoach => ({
    modo: 'decisao',
    numeroDaMao: 1,
    momento: 4,
    cartasNaMesa: 0,
    perfil: 'equilibrado',
    etapas: ['Calculei a equity contra 1 adversário: 54%.'],
    texto: { acao: 'pagar', resumo },
  });

  function corpo(linhas: unknown[]): ReadableStream<Uint8Array> {
    const texto = linhas.map((l) => JSON.stringify(l)).join('\n');
    const bytes = new TextEncoder().encode(texto);
    return new ReadableStream({
      start(controle) {
        // Pedaços de 7 bytes: linhas chegam cortadas, como na rede.
        for (let i = 0; i < bytes.length; i += 7) controle.enqueue(bytes.slice(i, i + 7));
        controle.close();
      },
    });
  }

  it('repassa cada pedaço escrito e devolve a resposta final', async () => {
    const recebidas: EscritaDoCoach[] = [];
    const r = await lerRespostaAoVivo<{ acao: string }>(
      corpo([
        { tipo: 'escrita', escrita: escrita('Pague') },
        { tipo: 'escrita', escrita: escrita('Pague com 54%') },
        { tipo: 'final', dados: { acao: 'pagar' } },
      ]),
      (e) => recebidas.push(e),
    );
    expect(recebidas.map((e) => e.texto.resumo)).toEqual(['Pague', 'Pague com 54%']);
    expect(r).toEqual({ ok: true, dados: { acao: 'pagar' } });
  });

  it('sem linha final, é falha (a conexão caiu no meio)', async () => {
    const r = await lerRespostaAoVivo(corpo([{ tipo: 'escrita', escrita: escrita('Pa') }]));
    expect(r).toMatchObject({ ok: false });
  });
});

describe('LimiteDoCoach', () => {
  it('um pedido por vez, por jogador', () => {
    const limite = new LimiteDoCoach();
    expect(limite.tentarComecar('a', 10_000)).toBeNull();
    expect(limite.tentarComecar('a', 20_000)).toMatch(/ainda está analisando/);
    expect(limite.tentarComecar('b', 10_000)).toBeNull(); // outro jogador não espera
  });

  it('exige um intervalo mínimo entre pedidos', () => {
    const limite = new LimiteDoCoach();
    limite.tentarComecar('a', 10_000);
    limite.terminar('a');
    expect(limite.tentarComecar('a', 10_500)).toMatch(/Aguarde/);
    expect(limite.tentarComecar('a', 12_000)).toBeNull();
  });

  it('sem "um por vez", aceita um pedido novo com o anterior ainda em andamento', () => {
    const limite = new LimiteDoCoach(700, { umPorVez: false });
    expect(limite.tentarComecar('a', 10_000)).toBeNull();
    expect(limite.tentarComecar('a', 10_300)).toMatch(/Aguarde/); // o intervalo continua valendo
    expect(limite.tentarComecar('a', 10_800)).toBeNull();
  });

  it('o intervalo é configurável (a leitura automática usa um menor)', () => {
    const limite = new LimiteDoCoach(500);
    limite.tentarComecar('a', 10_000);
    limite.terminar('a');
    expect(limite.tentarComecar('a', 10_600)).toBeNull();
  });
});

describe('lerPedidoAoCoach', () => {
  it('aceita modo e perfil válidos', () => {
    expect(lerPedidoAoCoach({ modo: 'leitura', perfil: 'agressivo' })).toEqual({
      modo: 'leitura',
      perfil: 'agressivo',
    });
  });

  it.each([undefined, null, 'decisao', { modo: 'outro', perfil: 'kamikaze' }, { perfil: 42 }])(
    'entrada estranha (%o) vira decisão no perfil recomendado',
    (dado) => {
      expect(lerPedidoAoCoach(dado)).toEqual({ modo: 'decisao', perfil: 'equilibrado' });
    },
  );
});
