import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { AlternarTema } from '../../shared/ui/alternar-tema.component';

/** Item do menu: um por feature. Para esconder por perfil, filtre por auth.usuario()?.perfil (e proteja a rota com perfilGuard). */
interface ItemMenu {
  rota: string;
  rotulo: string;
}

/** Moldura das telas logadas: topo com o menu (rolável no celular) e a área de conteúdo. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AlternarTema],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topo">
      <a class="marca" routerLink="/inicio">Agent Desk</a>
      <nav aria-label="Principal">
        @for (item of menu; track item.rota) {
          <a [routerLink]="item.rota" routerLinkActive="ativo" ariaCurrentWhenActive="page">{{ item.rotulo }}</a>
        }
      </nav>
      <div class="acoes">
        <app-alternar-tema />
        <button type="button" class="ui-botao ui-botao--fantasma" (click)="auth.sair()">Sair</button>
      </div>
    </header>
    <router-outlet />
  `,
  styles: `
    .topo {
      position: sticky; top: 0; z-index: 10;
      display: flex; align-items: center; gap: var(--ui-e4);
      padding: calc(var(--ui-e2) + var(--ui-seguro-topo)) var(--ui-e4) var(--ui-e2);
      border-bottom: 1px solid var(--ui-linha);
      background: color-mix(in srgb, var(--ui-fundo) 92%, transparent);
      backdrop-filter: blur(8px);
    }
    .marca { flex: none; font-weight: 750; white-space: nowrap; text-decoration: none; color: var(--ui-marca-tinta); }
    nav { display: flex; gap: var(--ui-e1); flex: 1; min-width: 0; overflow-x: auto; }
    nav a {
      padding: var(--ui-e2) var(--ui-e3); border-radius: var(--ui-raio-controle);
      color: var(--ui-texto-2); text-decoration: none; white-space: nowrap; font-weight: 500;
    }
    nav a.ativo { background: var(--ui-superficie-2); color: var(--ui-texto); }
    .acoes { display: flex; align-items: center; flex: none; }
    .acoes .ui-botao { padding: 0 var(--ui-e3); }
    @media (max-width: 480px) {
      .topo { gap: var(--ui-e2); padding-inline: var(--ui-e2); }
      nav a { padding-inline: var(--ui-e2); }
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthStore);

  protected readonly menu: ItemMenu[] = [
    { rota: '/inicio', rotulo: 'Início' },
    { rota: '/tarefas', rotulo: 'Tarefas' },
  ];
}
