import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Lista vazia com uma frase do que fazer (UI "burra": só inputs e conteúdo projetado). */
@Component({
  selector: 'app-estado-vazio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="titulo">{{ titulo() }}</p>
    @if (descricao()) {
      <p class="ui-suave">{{ descricao() }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--ui-e2);
      justify-items: center;
      padding: var(--ui-e6) var(--ui-e4);
      border: 1px dashed var(--ui-linha);
      border-radius: var(--ui-raio);
      text-align: center;
    }
    .titulo { font-weight: 600; }
  `,
})
export class EstadoVazio {
  readonly titulo = input.required<string>();
  readonly descricao = input<string>();
}
