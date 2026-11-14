import { describe, expect, it } from 'vitest';
import { FilaCheia, FilaDaIA } from './fila.js';

/** Tarefa que só termina quando `liberar()` é chamado. */
function tarefaControlada() {
  let liberar = () => {};
  const promessa = new Promise<void>((resolver) => (liberar = resolver));
  return { tarefa: () => promessa, liberar: () => liberar() };
}

const semPrazo = () => new AbortController().signal;
const tique = () => new Promise((r) => setTimeout(r, 0));

describe('FilaDaIA: baixa prioridade', () => {
  it('executarSeLivre roda quando a IA está livre', async () => {
    const fila = new FilaDaIA(1, 5);
    await expect(fila.executarSeLivre(async () => 'leitura')).resolves.toBe('leitura');
    expect(fila.emAndamento).toBe(0);
  });

  it('executarSeLivre recusa na hora se há decisão rodando ou esperando', async () => {
    const fila = new FilaDaIA(1, 5);
    const a = tarefaControlada();
    const decisao = fila.executar(a.tarefa, semPrazo());
    await expect(fila.executarSeLivre(async () => 'leitura')).rejects.toBeInstanceOf(FilaCheia);
    a.liberar();
    await decisao;
  });

  it('uma leitura rodando não impede a decisão de entrar na fila', async () => {
    const fila = new FilaDaIA(1, 5);
    const leitura = tarefaControlada();
    const pLeitura = fila.executarSeLivre(leitura.tarefa);
    const pDecisao = fila.executar(async () => 'decisao', semPrazo());
    await tique();
    expect(fila.naFila).toBe(1);
    leitura.liberar();
    await expect(pDecisao).resolves.toBe('decisao');
    await pLeitura;
  });
});

describe('FilaDaIA', () => {
  it('roda no máximo `limite` tarefas ao mesmo tempo, na ordem de chegada', async () => {
    const fila = new FilaDaIA(1, 5);
    const ordem: string[] = [];
    const a = tarefaControlada();
    const b = tarefaControlada();

    const pa = fila.executar(async () => (await a.tarefa(), ordem.push('a')), semPrazo());
    const pb = fila.executar(async () => (await b.tarefa(), ordem.push('b')), semPrazo());
    await tique();
    expect(fila.emAndamento).toBe(1);
    expect(fila.naFila).toBe(1);

    b.liberar(); // b ainda está na fila: não pode terminar antes de a
    await tique();
    expect(ordem).toEqual([]);

    a.liberar();
    await Promise.all([pa, pb]);
    expect(ordem).toEqual(['a', 'b']);
    expect(fila.emAndamento).toBe(0);
  });

  it('não deixa um pedido novo furar a fila quando uma vaga abre', async () => {
    const fila = new FilaDaIA(1, 5);
    const a = tarefaControlada();
    let simultaneas = 0;
    let maximo = 0;
    const medir = async () => {
      simultaneas++;
      maximo = Math.max(maximo, simultaneas);
      await tique();
      simultaneas--;
    };

    const pa = fila.executar(a.tarefa, semPrazo());
    const pb = fila.executar(medir, semPrazo());
    await tique();
    a.liberar();
    const pc = fila.executar(medir, semPrazo()); // chega no instante em que a vaga abre
    await Promise.all([pa, pb, pc]);
    expect(maximo).toBe(1);
  });

  it('recusa na hora quando a fila de espera está cheia', async () => {
    const fila = new FilaDaIA(1, 1);
    const a = tarefaControlada();
    const pa = fila.executar(a.tarefa, semPrazo());
    const pb = fila.executar(async () => 'b', semPrazo());
    await expect(fila.executar(async () => 'c', semPrazo())).rejects.toBeInstanceOf(FilaCheia);
    a.liberar();
    await Promise.all([pa, pb]);
  });

  it('quem desiste por prazo sai da fila', async () => {
    const fila = new FilaDaIA(1, 5);
    const a = tarefaControlada();
    const prazo = new AbortController();
    const pa = fila.executar(a.tarefa, semPrazo());
    const pb = fila.executar(async () => 'b', prazo.signal);
    await tique();
    prazo.abort(new Error('prazo'));
    await expect(pb).rejects.toThrow('prazo');
    expect(fila.naFila).toBe(0);
    a.liberar();
    await pa;
    expect(fila.emAndamento).toBe(0);
  });
});
