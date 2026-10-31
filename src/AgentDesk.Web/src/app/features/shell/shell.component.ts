import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { MoedaApp } from '../../core/moeda/moeda';
import { MOEDAS, Moeda } from '../../shared/util/moeda-ativa';
import { AlternarTema } from '../../shared/ui/alternar-tema.component';
import { formatarData } from '../../shared/util/formatos';

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
        @if (auth.usuario(); as u) {
          <p class="usuario" aria-label="Usuário logado" [title]="u.email">
            <strong>{{ u.nome }}</strong>
            <small>{{ u.perfil === 'ADMIN' ? 'Administrador' : 'Usuário' }} · {{ u.email }}</small>
          </p>
        }
        <select class="moeda ui-entrada" aria-label="Moeda dos valores" [value]="moeda.efetiva()" (change)="moeda.escolher($any($event.target).value)"
                [title]="dicaMoeda()">
          @for (m of opcoesMoeda(); track m.codigo) {
            <option [value]="m.codigo" [selected]="m.codigo === moeda.efetiva()">{{ m.simbolo }}</option>
          }
        </select>
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
    .acoes { display: flex; align-items: center; flex: none; gap: var(--ui-e2); }
    .moeda { width: auto; min-height: 0; padding: var(--ui-e1) var(--ui-e2); }
    .usuario { display: grid; margin: 0; line-height: 1.2; text-align: right; min-width: 0; }
    .usuario strong { font-size: var(--ui-t-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 12rem; }
    .usuario small { font-size: var(--ui-t-xs); color: var(--ui-texto-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 12rem; }
    .acoes .ui-botao { padding: 0 var(--ui-e3); }
    @media (max-width: 720px) {
      .usuario small { display: none; }
      .usuario strong { max-width: 6rem; }
      /* Celular: marca e ações na 1ª linha, o menu rolável na 2ª (não cabe tudo numa linha só) */
      .topo { flex-wrap: wrap; row-gap: var(--ui-e1); }
      .marca { order: 1; }
      .acoes { order: 2; margin-left: auto; }
      nav { order: 3; flex-basis: 100%; }
    }
    @media (max-width: 480px) {
      .topo { gap: var(--ui-e2); padding-inline: var(--ui-e2); }
      nav a { padding-inline: var(--ui-e2); }
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly moeda = inject(MoedaApp);
  protected readonly opcoesMoeda = computed(() => MOEDAS.filter((m) => this.moeda.disponiveis().includes(m.codigo)));
  protected readonly dicaMoeda = computed(() => {
    const c = this.moeda.cotacoes();
    return c ? `Valores calculados em dólar e convertidos pela ${c.fonte}, de ${formatarData(`${c.dataCotacao}T12:00:00-03:00`)}` : 'Cotação indisponível: valores em dólar';
  });

  constructor() {
    void this.moeda.carregar();
  }

  protected readonly menu: ItemMenu[] = [
    { rota: '/inicio', rotulo: 'Início' },
    { rota: '/automacoes', rotulo: 'Automações' },
    { rota: '/consumo', rotulo: 'Consumo' },
    { rota: '/escritorio', rotulo: 'Escritório' },
    { rota: '/configuracoes', rotulo: 'Configurações' },
  ];
}
