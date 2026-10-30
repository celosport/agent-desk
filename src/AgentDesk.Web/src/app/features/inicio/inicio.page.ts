import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

/** Tela inicial depois do login. Troque pelo painel do seu produto. */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina">
      <h1 class="ui-titulo-pagina">Olá, {{ auth.primeiroNome() }}</h1>
      <section class="ui-cartao">
        <h2>Esqueleto pronto</h2>
        <p class="ui-suave">
          Login, cadastro, tema claro/escuro, PWA com aviso de nova versão e um CRUD de exemplo integrado à API.
          Copie a feature <strong>Tarefas</strong> para criar a sua.
        </p>
        <a class="ui-botao ui-botao--primario" routerLink="/tarefas">Abrir Tarefas</a>
      </section>
    </main>
  `,
  styles: `
    section { display: grid; gap: var(--ui-e3); justify-items: start; }
  `,
})
export class InicioPage {
  protected readonly auth = inject(AuthStore);
}
