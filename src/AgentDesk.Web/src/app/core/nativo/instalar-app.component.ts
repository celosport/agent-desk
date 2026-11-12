import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { InstalarApp } from './instalar-app.service';

const CHAVE_ADIADO = 'agentdesk.instalar.adiado-ate';
const TRES_DIAS = 3 * 24 * 60 * 60 * 1000;

function adiadoAte(): number {
  try { return Number(localStorage.getItem(CHAVE_ADIADO) ?? 0); } catch { return 0; }
}

/**
 * Cartão "Instale o app". Android/Chrome: botão de um toque. iPhone/iPad: passo a passo (a Apple não deixa instalar por botão).
 * Com `etapa` (cadastro) não tem "Agora não"; fora dela, "Agora não" adia por 3 dias. Nunca aparece se já está instalado
 * ou se o aparelho não suporta (`modo() === 'nenhum'`).
 */
@Component({
  selector: 'app-instalar-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visivel()) {
      <section class="instalar" aria-labelledby="instalar-titulo">
        <h2 id="instalar-titulo">Instale o Agent Desk</h2>
        <p>Use como um aplicativo do celular: abre pelo ícone, em tela cheia, e recebe os alertas quando uma tarefa termina.</p>
        @if (instalarApp.modo() === 'botao') {
          <button type="button" class="ui-botao ui-botao--primario ui-botao--bloco" (click)="instalar()">Instalar app</button>
        } @else {
          <ol>
            <li>Toque em <strong>Compartilhar</strong> (o quadrado com a seta) no Safari.</li>
            <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
            <li>Toque em <strong>Adicionar</strong>.</li>
          </ol>
        }
        @if (etapa()) {
          <p class="dica">Depois de instalar, volte a esta tela para criar sua conta.</p>
          <button type="button" class="ui-botao ui-botao--bloco" (click)="continuar.emit()">Já instalei · criar minha conta</button>
        } @else {
          <button type="button" class="ui-botao ui-botao--bloco" (click)="agoraNao()">Agora não</button>
        }
      </section>
    }
  `,
  styles: `
    .instalar { display: grid; gap: var(--ui-e3); }
    h2 { margin: 0; font-size: 1.125rem; }
    p, ol { margin: 0; }
    ol { padding-left: var(--ui-e5); display: grid; gap: var(--ui-e2); }
    .dica { font-size: .875rem; opacity: .8; }
  `,
})
export class InstalarAppCartao {
  protected readonly instalarApp = inject(InstalarApp);
  /** Etapa obrigatória do cadastro (sem "Agora não"). */
  readonly etapa = input(false);
  readonly continuar = output<void>();

  private readonly adiado = signal(adiadoAte() > Date.now());
  protected readonly visivel = computed(() => this.instalarApp.modo() !== 'nenhum' && (this.etapa() || !this.adiado()));

  protected async instalar(): Promise<void> {
    const aceitou = await this.instalarApp.instalar();
    if (aceitou && this.etapa()) this.continuar.emit();
  }

  protected agoraNao(): void {
    try { localStorage.setItem(CHAVE_ADIADO, String(Date.now() + TRES_DIAS)); } catch { /* sem armazenamento: some só desta vez */ }
    this.adiado.set(true);
  }
}
