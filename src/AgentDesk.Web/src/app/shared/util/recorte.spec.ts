import { clamp, dimensoesGiradas, escalas, limitarDeslocamento, recorteInicial, ZOOM_MAXIMO } from './recorte';

describe('recorte da foto', () => {
  it('a escala base faz a imagem cobrir o quadro (pelo lado menor)', () => {
    const e = recorteInicial(1000, 500, 320); // paisagem: o lado menor é 500
    expect(escalas(e).base).toBeCloseTo(320 / 500);
  });

  it('girar 90° troca largura e altura', () => {
    expect(dimensoesGiradas({ larguraImg: 1000, alturaImg: 500, rotacao: 1 })).toEqual({ largura: 500, altura: 1000 });
    expect(dimensoesGiradas({ larguraImg: 1000, alturaImg: 500, rotacao: 2 })).toEqual({ largura: 1000, altura: 500 });
  });

  it('sem zoom, a imagem quadrada não pode sair do lugar', () => {
    const e = { ...recorteInicial(800, 800, 320), deslocX: 90, deslocY: -50 };
    const { x, y } = limitarDeslocamento(e);
    expect(Math.abs(x)).toBe(0); // (evita -0 vs +0 do clamp)
    expect(Math.abs(y)).toBe(0);
  });

  it('paisagem: só pode arrastar na horizontal, até a sobra de cada lado', () => {
    const e = { ...recorteInicial(1000, 500, 320), deslocX: 9999, deslocY: 9999 };
    const { x, y } = limitarDeslocamento(e);
    expect(Math.abs(y)).toBe(0);
    expect(x).toBeCloseTo((1000 * (320 / 500) - 320) / 2); // 160
  });

  it('com zoom há mais espaço para arrastar, e o zoom é limitado', () => {
    const e = { ...recorteInicial(800, 800, 320), zoom: 2, deslocX: -9999 };
    expect(limitarDeslocamento(e).x).toBeCloseTo(-160); // (640 - 320) / 2
    expect(escalas({ ...e, zoom: 99 }).total).toBeCloseTo((320 / 800) * ZOOM_MAXIMO);
  });

  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
