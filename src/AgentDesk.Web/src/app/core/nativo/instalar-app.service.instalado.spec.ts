import { TestBed } from '@angular/core/testing';
import { InstalarApp } from './instalar-app.service';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

describe('InstalarApp — aviso de instalado', () => {
  const agente = (ua: string) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  beforeEach(() => agente(ANDROID));

  function oferecer(resultado: 'accepted' | 'dismissed'): void {
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: resultado }),
    }));
  }

  it('instalou: avisa que já pode fechar a aba e o Ok some com o aviso', async () => {
    const app = TestBed.inject(InstalarApp);
    oferecer('accepted');
    expect(app.modo()).toBe('botao');
    expect(app.avisoInstalado()).toBe(false);

    expect(await app.instalar()).toBe(true);

    expect(app.avisoInstalado()).toBe(true);
    expect(app.modo()).toBe('nenhum');
    app.fecharAviso();
    expect(app.avisoInstalado()).toBe(false);
  });

  it('recusou: nenhum aviso de instalado', async () => {
    const app = TestBed.inject(InstalarApp);
    oferecer('dismissed');

    expect(await app.instalar()).toBe(false);

    expect(app.avisoInstalado()).toBe(false);
  });

  it('o navegador avisa que terminou (appinstalled): também mostra o aviso', () => {
    const app = TestBed.inject(InstalarApp);

    window.dispatchEvent(new Event('appinstalled'));

    expect(app.avisoInstalado()).toBe(true);
  });

  it('no notebook/desktop: sem oferta de instalação e sem "pode fechar a aba"', async () => {
    agente(WINDOWS);
    const app = TestBed.inject(InstalarApp);
    oferecer('accepted');

    expect(app.modo()).toBe('nenhum');
    window.dispatchEvent(new Event('appinstalled'));
    expect(app.avisoInstalado()).toBe(false);
  });
});
