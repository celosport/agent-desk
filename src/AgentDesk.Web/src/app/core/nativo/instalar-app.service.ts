import { Injectable, computed, signal } from '@angular/core';

export interface EventoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export type ModoInstalacao = 'botao' | 'ios' | 'nenhum';

/** Como oferecer a instalação: botão (Android/Chrome/Edge), passo a passo (iPhone/iPad) ou nada. */
export function modoInstalacao(o: { instalado: boolean; temEvento: boolean; userAgent: string }): ModoInstalacao {
  if (o.instalado) return 'nenhum';
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

  readonly modo = computed<ModoInstalacao>(() => modoInstalacao({
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
    });
  }

  /** Abre o diálogo de instalação do navegador. `true` se a pessoa aceitou. */
  async instalar(): Promise<boolean> {
    const e = this.evento();
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    this.evento.set(null); // o evento só vale uma vez
    if (outcome === 'accepted') this.instalado.set(true);
    return outcome === 'accepted';
  }
}

function estaInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
