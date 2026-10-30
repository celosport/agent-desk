import { formatarData, formatarDataHora, formatarDolar, formatarDolarCompacto, formatarHaQuanto, formatarMoeda, formatarNumero } from './formatos';

describe('formatos pt-BR', () => {
  it('datas da API (UTC) aparecem no horário de Brasília', () => {
    expect(formatarData('2026-10-30T02:00:00Z')).toBe('29/10/2026');
    expect(formatarDataHora('2026-10-30T16:45:00Z')).toBe('30/10/2026, 13:45');
    expect(formatarData(undefined)).toBe('');
  });

  it('moeda em reais', () => {
    expect(formatarMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });

  it('dólar com casas extras para valores pequenos', () => {
    const d = (v: number | null, casas?: number) => formatarDolar(v, casas).replace(/\s/g, ' ');
    expect(d(4)).toBe('US$ 4,00');
    expect(d(0.125)).toBe('US$ 0,125');
    expect(d(0.00012345)).toBe('US$ 0,0001');
    expect(d(1234.5, 2)).toBe('US$ 1.234,50');
    expect(d(null)).toBe('');
  });

  it('dólar compacto: 2 casas a partir de US$ 1, 4 abaixo', () => {
    expect(formatarDolarCompacto(12.3456).replace(/\s/g, ' ')).toBe('US$ 12,35');
    expect(formatarDolarCompacto(0.570333).replace(/\s/g, ' ')).toBe('US$ 0,5703');
  });

  it('há quanto tempo', () => {
    const agora = new Date('2026-10-30T12:00:00Z').getTime();
    expect(formatarHaQuanto('2026-10-30T11:59:30Z', agora)).toBe('agora');
    expect(formatarHaQuanto('2026-10-30T11:57:00Z', agora)).toBe('há 3 min');
    expect(formatarHaQuanto('2026-10-30T09:00:00Z', agora)).toBe('há 3 h');
    expect(formatarHaQuanto('2026-10-29T12:00:00Z', agora)).toBe('há 1 dia');
  });

  it('números com separador de milhar', () => {
    expect(formatarNumero(1234567)).toBe('1.234.567');
  });
});
