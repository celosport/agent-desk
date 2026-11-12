import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Foto da pessoa em círculo; sem foto, mostra as iniciais sobre a cor da marca. UI "burra": só inputs. */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="'Foto de ' + nome()" />
    } @else {
      <span aria-hidden="true">{{ iniciais() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid; place-items: center; flex: none; overflow: hidden; border-radius: 50%;
      width: var(--avatar, 36px); height: var(--avatar, 36px);
      background: color-mix(in srgb, var(--ui-marca-tinta) 18%, transparent); color: var(--ui-marca-tinta); font-weight: 700;
      font-size: calc(var(--avatar, 36px) * 0.4);
    }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  `,
})
export class Avatar {
  readonly nome = input.required<string>();
  readonly src = input<string | null | undefined>();

  protected readonly iniciais = computed(() => {
    const partes = this.nome().trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  });
}
