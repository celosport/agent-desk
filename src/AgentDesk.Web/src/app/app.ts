import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AtualizacaoApp } from './core/atualizacao/atualizacao-app';
import { TemaApp } from './core/tema/tema';
import { Avisos } from './core/ui/avisos.service';

/** Raiz: rotas + o que vale para todas as telas (aviso de nova versão e avisos curtos). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    @if (atualizacao.disponivel()) {
      <div class="atualizacao" role="status">
        <span>Nova versão disponível.</span>
        <button type="button" class="ui-botao ui-botao--primario" (click)="atualizacao.atualizar()">Atualizar</button>
      </div>
    }
    <div class="avisos" role="status" aria-live="polite">
      @for (aviso of avisos.lista(); track aviso.id) {
        <p class="aviso" [class.aviso--erro]="aviso.tipo === 'erro'" [class.aviso--sucesso]="aviso.tipo === 'sucesso'">{{ aviso.texto }}</p>
      }
    </div>
  `,
  styles: `
    .atualizacao {
      position: fixed; inset: auto var(--ui-e4) calc(var(--ui-e4) + var(--ui-seguro-base)); z-index: 60;
      display: flex; align-items: center; justify-content: space-between; gap: var(--ui-e3);
      max-width: 480px; margin: 0 auto; padding: var(--ui-e3) var(--ui-e4);
      border: 1px solid var(--ui-linha); border-radius: var(--ui-raio); background: var(--ui-superficie);
      box-shadow: 0 8px 24px var(--ui-sombra); font-weight: 600;
    }
    .avisos {
      position: fixed; inset: auto 0 calc(var(--ui-e6) * 2 + var(--ui-seguro-base)); z-index: 50;
      display: grid; gap: var(--ui-e2); justify-items: center; padding: 0 var(--ui-e4); pointer-events: none;
    }
    .aviso {
      max-width: 440px; padding: var(--ui-e3) var(--ui-e4); border-radius: var(--ui-raio-controle);
      background: var(--ui-texto); color: var(--ui-fundo); font-weight: 500;
      box-shadow: 0 8px 24px var(--ui-sombra); animation: entrar 160ms ease-out;
    }
    .aviso--erro { background: var(--ui-vermelho); color: #fff; }
    .aviso--sucesso { background: var(--ui-verde); color: #fff; }
    @keyframes entrar { from { opacity: 0; transform: translateY(8px); } }
  `,
})
export class App {
  protected readonly avisos = inject(Avisos);
  protected readonly atualizacao = inject(AtualizacaoApp);

  constructor() {
    inject(TemaApp); // aplica o tema escolhido (ou o do aparelho)
  }
}
