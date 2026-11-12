import { describe, expect, it } from 'vitest';
import { ehCelular, modoInstalacao } from './instalar-app.service';

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

describe('ehCelular / computador', () => {
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

  it('reconhece celular e tablet', () => {
    expect(ehCelular(ANDROID)).toBe(true);
    expect(ehCelular(IPHONE)).toBe(true);
    expect(ehCelular(MAC, 5)).toBe(true); // iPad novo se apresenta como Mac, mas tem toque
  });

  it('notebook e desktop não são celular', () => {
    expect(ehCelular(WINDOWS)).toBe(false);
    expect(ehCelular(MAC, 0)).toBe(false);
  });

  it('no computador não oferece instalação, mesmo com o evento do Chrome', () => {
    expect(modoInstalacao({ instalado: false, temEvento: true, userAgent: WINDOWS, celular: false })).toBe('nenhum');
  });
});
