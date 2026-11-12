import { describe, expect, it } from 'vitest';
import { modoInstalacao } from './instalar-app.service';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

describe('modoInstalacao', () => {
  it('já instalado → nada', () => {
    expect(modoInstalacao({ instalado: true, temEvento: true, userAgent: IPHONE })).toBe('nenhum');
  });
  it('com evento do navegador → botão', () => {
    expect(modoInstalacao({ instalado: false, temEvento: true, userAgent: ANDROID })).toBe('botao');
  });
  it('iPhone sem evento → passo a passo', () => {
    expect(modoInstalacao({ instalado: false, temEvento: false, userAgent: IPHONE })).toBe('ios');
  });
  it('Android sem evento → nada', () => {
    expect(modoInstalacao({ instalado: false, temEvento: false, userAgent: ANDROID })).toBe('nenhum');
  });
});
