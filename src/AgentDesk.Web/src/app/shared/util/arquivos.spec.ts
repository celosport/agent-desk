import { TAMANHO_MAXIMO_ENTRADA, nomeArquivoResultado, tamanhoEmBytes, validarArquivoEntrada } from './arquivos';

describe('arquivos', () => {
  it('aceita só .txt/.md de até 200 KB', () => {
    expect(validarArquivoEntrada({ name: 'notas.MD', size: 10 })).toBeNull();
    expect(validarArquivoEntrada({ name: 'codigo.txt', size: TAMANHO_MAXIMO_ENTRADA })).toBeNull();
    expect(validarArquivoEntrada({ name: 'relatorio.pdf', size: 10 })).toBe('Só arquivos .txt ou .md.');
    expect(validarArquivoEntrada({ name: 'grande.md', size: TAMANHO_MAXIMO_ENTRADA + 1 })).toBe('O arquivo tem mais de 200 KB.');
  });

  it('conta bytes em UTF-8, como a API', () => {
    expect(tamanhoEmBytes('abc')).toBe(3);
    expect(tamanhoEmBytes('ção')).toBe(5);
  });

  it('nome do .md com data e hora de Brasília', () => {
    expect(nomeArquivoResultado('resumir-documento', new Date('2026-10-30T16:45:00Z'))).toBe('resumir-documento-2026-10-30-1345.md');
    expect(nomeArquivoResultado('analisar-codigo', new Date('2026-11-01T02:05:00Z'))).toBe('analisar-codigo-2026-10-31-2305.md');
  });
});
