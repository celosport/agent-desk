import { DestroyRef } from '@angular/core';

/** Liga `aoMudar` ao prefers-reduced-motion (já chama com o valor atual) e solta o ouvinte quando o componente sai. */
export function acompanharMovimentoReduzido(aoMudar: (reduzido: boolean) => void, destroyRef: DestroyRef): void {
  const midia = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  aoMudar(midia?.matches ?? false);
  const ouvinte = (e: MediaQueryListEvent) => aoMudar(e.matches);
  midia?.addEventListener?.('change', ouvinte);
  destroyRef.onDestroy(() => midia?.removeEventListener?.('change', ouvinte));
}
