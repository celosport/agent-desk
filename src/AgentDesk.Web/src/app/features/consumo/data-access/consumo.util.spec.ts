import { alturaBarra, diaCurto, eixoRedondo, estadoLimite, parametrosHistorico } from './consumo.util';

describe('consumo.util', () => {
  it('eixo começa em zero e termina num número redondo', () => {
    expect(eixoRedondo(0.0137)).toEqual({ teto: 0.015, passos: [0, 0.005, 0.01, 0.015] });
    expect(eixoRedondo(7.3)).toEqual({ teto: 8, passos: [0, 2, 4, 6, 8] });
    expect(eixoRedondo(100)).toEqual({ teto: 100, passos: [0, 25, 50, 75, 100] });
    expect(eixoRedondo(0)).toEqual({ teto: 1, passos: [0, 0.5, 1] });
  });

  it('barra proporcional, com mínimo visível para valores pequenos', () => {
    expect(alturaBarra(5, 10, 100)).toBe(50);
    expect(alturaBarra(0.0001, 10, 100)).toBe(2);
    expect(alturaBarra(0, 10, 100)).toBe(0);
  });

  it('dia curto sem converter fuso', () => {
    expect(diaCurto('2026-10-01')).toBe('01/10');
  });

  it('só manda os filtros preenchidos', () => {
    expect(
      parametrosHistorico({ escopo: 'MEU', de: '2026-10-01', ate: '', automacaoId: '', modeloId: 'claude-opus-5-5', status: '', pagina: 2, tamanho: 20 }),
    ).toEqual({ escopo: 'MEU', pagina: 2, tamanho: 20, de: '2026-10-01', modeloId: 'claude-opus-5-5' });
  });

  it('estado do limite: alerta a partir de 80%, estourado a partir de 100%', () => {
    expect(estadoLimite(undefined)).toBe('normal');
    expect(estadoLimite(79.9)).toBe('normal');
    expect(estadoLimite(80)).toBe('alerta');
    expect(estadoLimite(100)).toBe('estourado');
  });
});
