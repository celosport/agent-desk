import { formatarData, formatarDataHora, formatarMoeda } from './formatos';

describe('formatos pt-BR', () => {
  it('datas da API (UTC) aparecem no horário de Brasília', () => {
    expect(formatarData('2026-10-30T02:00:00Z')).toBe('29/10/2026');
    expect(formatarDataHora('2026-10-30T16:45:00Z')).toBe('30/10/2026, 13:45');
    expect(formatarData(undefined)).toBe('');
  });

  it('moeda em reais', () => {
    expect(formatarMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
});
