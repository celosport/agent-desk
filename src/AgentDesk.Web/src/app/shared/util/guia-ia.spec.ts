import { describe, expect, it } from 'vitest';
import { guiaParaIa } from './guia-ia';

describe('guia para a IA', () => {
  it('coloca o endereço do app (sem barra no fim) em todos os lugares e nunca um token', () => {
    const g = guiaParaIa('Endereço: {{ENDERECO}} e de novo {{ENDERECO}}', 'https://app.exemplo.com/');
    expect(g).toBe('Endereço: https://app.exemplo.com e de novo https://app.exemplo.com');
    expect(g).not.toContain('adk_');
  });
});
