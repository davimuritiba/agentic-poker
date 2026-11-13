import { describe, expect, it } from 'vitest';
import { escolherProvedor } from './provedor.js';

describe('escolherProvedor', () => {
  it('COACH_PROVEDOR=ollama usa o modelo local, padrão qwen3:8b, uma análise por vez', () => {
    const p = escolherProvedor({ COACH_PROVEDOR: 'ollama' });
    expect(p).toMatchObject({ nome: 'ollama', modelo: 'qwen3:8b', concorrencia: 1 });
  });

  it('modelo e concorrência configuráveis', () => {
    const p = escolherProvedor({
      COACH_PROVEDOR: 'ollama',
      COACH_MODELO: 'llama3.1:8b',
      COACH_CONCORRENCIA: '2',
    });
    expect(p).toMatchObject({ modelo: 'llama3.1:8b', concorrencia: 2 });
  });

  it('com chave da Anthropic e sem escolha explícita, usa o Claude', () => {
    expect(escolherProvedor({ ANTHROPIC_API_KEY: 'sk-ant-teste' })).toMatchObject({
      nome: 'claude',
      modelo: 'claude-opus-5-5',
    });
  });

  it('COACH_PROVEDOR=regras desliga a IA e explica o motivo', async () => {
    const p = escolherProvedor({ COACH_PROVEDOR: 'regras' });
    expect(p.nome).toBe('regras');
    expect(await p.verificar()).toMatchObject({ motivo: expect.stringMatching(/regras/) });
  });

  it('provedor desconhecido vira coach por regras', async () => {
    const p = escolherProvedor({ COACH_PROVEDOR: 'gpt' });
    expect(p.nome).toBe('regras');
    expect(await p.verificar()).toMatchObject({ motivo: expect.stringMatching(/desconhecido/) });
  });

  it('Ollama fora do ar aparece na verificação com a dica', async () => {
    const p = escolherProvedor({ COACH_PROVEDOR: 'ollama', OLLAMA_URL: 'http://127.0.0.1:1' });
    expect(await p.verificar()).toMatchObject({
      ollama: 'fora do ar',
      dica: expect.stringMatching(/ollama serve/),
    });
  });
});
