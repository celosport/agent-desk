import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface EventoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export type ModoInstalacao = 'botao' | 'ios' | 'nenhum';

/**
 * Celular ou tablet (inclui o iPad novo, que se apresenta como Mac mas tem tela de toque). No notebook/desktop o app não pede
 * instalação nem diz para fechar a aba: lá ele roda normalmente no navegador.
 */
export function ehCelular(userAgent: string, pontosDeToque = 0): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/.test(userAgent) && pontosDeToque > 1);
}

/** Como oferecer a instalação: botão (Android/Chrome/Edge), passo a passo (iPhone/iPad) ou nada (inclusive no computador). */
export function modoInstalacao(o: { instalado: boolean; temEvento: boolean; userAgent: string; celular?: boolean }): ModoInstalacao {
  if (o.instalado || o.celular === false) return 'nenhum';
  if (o.temEvento) return 'botao';
  return /iPhone|iPad|iPod/.test(o.userAgent) ? 'ios' : 'nenhum';
}

/**
 * Instalação do PWA. Precisa ser injetado cedo (o `App` faz isso): o `beforeinstallprompt` do Chrome pode disparar
 * antes de a pessoa chegar à tela de cadastro.
 */
@Injectable({ providedIn: 'root' })
export class InstalarApp {
  private readonly evento = signal<EventoInstalacao | null>(null);
  private readonly instalado = signal(estaInstalado());

  /**
   * Acabou de instalar: o navegador não deixa um site fechar a aba por conta própria, então o app avisa que já pode fechá-la
   * e abrir pelo ícone. Só vale até a pessoa tocar em Ok (ou recarregar).
   */
  readonly avisoInstalado = signal(false);

  private readonly celular = signal(
    typeof navigator !== 'undefined' && ehCelular(navigator.userAgent, navigator.maxTouchPoints));

  readonly modo = computed<ModoInstalacao>(() => modoInstalacao({
    celular: this.celular(),
    instalado: this.instalado(),
    temEvento: this.evento() !== null,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  }));

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.evento.set(e as EventoInstalacao);
    });
    window.addEventListener('appinstalled', () => {
      this.evento.set(null);
      this.instalado.set(true);
      if (this.celular()) this.avisoInstalado.set(true); // "pode fechar a aba" só faz sentido no celular
    });
    // Só no build com API mock (E2E e demonstração): `?instalar=botao` simula o navegador que oferece a instalação
    if (environment.mockApi && new URLSearchParams(location.search).get('instalar') === 'botao') {
      this.celular.set(true);
      this.evento.set(eventoDeTeste());
    }
  }

  fecharAviso(): void {
    this.avisoInstalado.set(false);
  }

  /** Abre o diálogo de instalação do navegador. `true` se a pessoa aceitou. */
  async instalar(): Promise<boolean> {
    const e = this.evento();
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    this.evento.set(null); // o evento só vale uma vez
    if (outcome === 'accepted') {
      this.instalado.set(true);
      if (this.celular()) this.avisoInstalado.set(true);
    }
    return outcome === 'accepted';
  }
}

function eventoDeTeste(): EventoInstalacao {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
}

function estaInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
