import { describe, expect, it } from 'vitest';
import { lerJsonParcial } from './json-parcial.js';

describe('lerJsonParcial', () => {
  it('lê a string que ainda está sendo escrita', () => {
    expect(lerJsonParcial('{"acao":"pagar","valor":null,"resumo":"Pague com 4')).toEqual({
      acao: 'pagar',
      valor: null,
      resumo: 'Pague com 4',
    });
  });

  it('descarta o último pedaço quando ele não fecha (chave ou valor pela metade)', () => {
    expect(lerJsonParcial('{"acao":"pagar","valor":nu')).toEqual({ acao: 'pagar' });
    expect(lerJsonParcial('{"acao":"pagar","resu')).toEqual({ acao: 'pagar' });
    expect(lerJsonParcial('{"acao":"pagar","resumo":')).toEqual({ acao: 'pagar' });
  });

  it('fecha listas e objetos abertos', () => {
    expect(
      lerJsonParcial('{"acao":"aumentar","alternativas":[{"acao":"pagar","quando":"se o adv'),
    ).toEqual({
      acao: 'aumentar',
      alternativas: [{ acao: 'pagar', quando: 'se o adv' }],
    });
  });

  it('respeita aspas e barras escapadas dentro do texto', () => {
    expect(lerJsonParcial('{"resumo":"Ele disse \\"pague\\" e')).toEqual({
      resumo: 'Ele disse "pague" e',
    });
    expect(lerJsonParcial('{"resumo":"barra \\')).toEqual({ resumo: 'barra ' });
  });

  it('ignora texto antes do JSON e lê o JSON completo normalmente', () => {
    expect(lerJsonParcial('ok {"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('vazio ou sem objeto ainda', () => {
    expect(lerJsonParcial('')).toBeNull();
    expect(lerJsonParcial('{')).toEqual({});
    expect(lerJsonParcial('{"aca')).toEqual({});
  });

  it('cada pedaço novo só acrescenta texto (como o jogador vê)', () => {
    const completo = JSON.stringify({ acao: 'desistir', valor: null, resumo: 'Equity baixa.' });
    let anterior = '';
    for (let i = 1; i <= completo.length; i++) {
      const lido = lerJsonParcial(completo.slice(0, i));
      const resumo = typeof lido?.resumo === 'string' ? lido.resumo : '';
      expect(resumo.startsWith(anterior)).toBe(true);
      anterior = resumo;
    }
    expect(anterior).toBe('Equity baixa.');
  });
});
