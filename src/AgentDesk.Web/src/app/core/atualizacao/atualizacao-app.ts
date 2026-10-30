import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Nova versão do app (PWA): o service worker baixa a versão nova em segundo plano, mas só passa a usá-la quando a
 * página é recarregada. Aqui o app procura versão nova ao abrir e ao voltar para a aba, e avisa com "Atualizar" —
 * sem recarregar sozinho, para não perder o que a pessoa está fazendo.
 */
@Injectable({ providedIn: 'root' })
export class AtualizacaoApp {
  private readonly sw = inject(SwUpdate);
  private ultimaChecagem = 0;

  readonly disponivel = signal(false);

  constructor() {
    if (!this.sw.isEnabled) return;
    const assinatura = this.sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.disponivel.set(true));
    inject(DestroyRef).onDestroy(() => assinatura.unsubscribe());

    void this.procurar();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.ultimaChecagem > 10 * 60_000) void this.procurar();
    });
  }

  private async procurar(): Promise<void> {
    this.ultimaChecagem = Date.now();
    try {
      await this.sw.checkForUpdate();
    } catch {
      // Sem rede: tenta de novo na próxima vez que a aba voltar
    }
  }

  /** Ativa a versão nova e recarrega a página. */
  async atualizar(): Promise<void> {
    try {
      await this.sw.activateUpdate();
    } finally {
      location.reload();
    }
  }
}
