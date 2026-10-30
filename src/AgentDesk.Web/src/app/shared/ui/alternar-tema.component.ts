import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TemaApp } from '../../core/tema/tema';

/** Botão claro/escuro. */
@Component({
  selector: 'app-alternar-tema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="ui-botao ui-botao--fantasma" [attr.aria-label]="rotulo()" [title]="rotulo()" (click)="tema.alternar()">
      <span aria-hidden="true">{{ tema.tema() === 'escuro' ? '☀' : '☾' }}</span>
    </button>
  `,
})
export class AlternarTema {
  protected readonly tema = inject(TemaApp);
  protected readonly rotulo = computed(() => (this.tema.tema() === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'));
}
