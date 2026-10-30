import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CenaEscritorio, corDoAgente } from './cena-escritorio.component';
import { EscritorioStore } from './data-access/escritorio.store';

/**
 * Escritório: cada automação é um robô na sala. Ao disparar um fluxo, o robô anda até a mesa, mostra "pensando…" e, quando a API
 * responde, um balão com os tokens e o custo. Respeita prefers-reduced-motion (sem caminhada nem animações). [[Escritório Animado]]
 */
@Component({
  selector: 'app-escritorio',
  imports: [ReactiveFormsModule, RouterLink, CenaEscritorio],
  providers: [EscritorioStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina larga">
      <h1 class="ui-titulo-pagina">Escritório</h1>

      @if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
        <button type="button" class="ui-botao" (click)="store.carregar()">Tentar de novo</button>
      } @else if (store.carregando() && !store.status().length) {
        <p class="ui-suave">Carregando…</p>
      } @else {
        <div class="layout">
          <section class="ui-cartao sala" aria-label="Sala dos agentes">
            <app-cena-escritorio />
            <p class="ui-suave dica">Clique num robô (ou na lista) para escolher quem vai trabalhar.</p>
          </section>

          <section class="ui-cartao painel" aria-labelledby="titulo-agentes">
            <h2 id="titulo-agentes">Agentes</h2>
            <ul class="agentes" aria-label="Agentes">
              @for (s of store.status(); track s.codigo) {
                <li>
                  <button type="button" class="agente" [attr.aria-pressed]="s.codigo === store.selecionado()" (click)="store.selecionado.set(s.codigo)">
                    <span class="cor" [style.background]="cor(s.codigo)" aria-hidden="true"></span>
                    <span class="nomes"><strong>{{ s.apelido }}</strong> <span class="ui-suave">{{ s.automacao }}</span></span>
                    <span class="status" [class.ocupado]="s.ocupado">{{ s.status }}</span>
                  </button>
                </li>
              }
            </ul>

            @if (store.selecionadoStatus(); as s) {
              <form class="pedido" [formGroup]="form" (ngSubmit)="executar(s.codigo)" novalidate>
                <div class="ui-campo">
                  <label for="pedido">Pedido para {{ s.apelido }} ({{ s.automacao }})</label>
                  <textarea id="pedido" class="ui-entrada texto" rows="5" formControlName="entrada"
                            placeholder="Cole o texto, o código ou o documento…"></textarea>
                </div>
                <button type="submit" class="ui-botao ui-botao--primario" [disabled]="s.ocupado">
                  {{ s.ocupado ? s.apelido + ' está trabalhando…' : 'Mandar ' + s.apelido + ' trabalhar' }}
                </button>
              </form>
            }

            @if (store.falha(); as f) {
              <div class="ui-erro" role="alert">
                <p>{{ f.mensagem }}</p>
                @if (f.irParaConfiguracoes) {
                  <a routerLink="/configuracoes">Ir para Configurações</a>
                }
              </div>
            }
            @if (store.ultimaExecucao()) {
              <p class="ui-suave"><a routerLink="/consumo/historico">Ver o resultado completo no histórico</a></p>
            }
          </section>
        </div>
        <p class="ui-visualmente-oculto" aria-live="polite">{{ store.anuncio() }}</p>
      }
    </main>
  `,
  styles: `
    .larga { max-width: min(76rem, 100%); }
    .layout { display: grid; gap: var(--ui-e4); grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .sala { display: grid; gap: var(--ui-e2); overflow: hidden; }
    .dica { font-size: var(--ui-t-xs); text-align: center; }
    .painel { display: grid; gap: var(--ui-e3); grid-template-columns: minmax(0, 1fr); }
    h2 { font-size: var(--ui-t-lg); }
    .agentes { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); }
    .agente { width: 100%; display: grid; grid-template-columns: auto 1fr; gap: 2px var(--ui-e2); align-items: center; text-align: left;
      padding: var(--ui-e2) var(--ui-e3); border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle);
      background: var(--ui-superficie); color: inherit; font: inherit; cursor: pointer; }
    .agente[aria-pressed='true'] { border-color: var(--ui-marca); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-marca) 30%, transparent); }
    .cor { width: 14px; height: 14px; border-radius: 3px; grid-row: span 2; }
    .nomes { display: flex; flex-wrap: wrap; gap: 0 var(--ui-e2); align-items: baseline; }
    .status { grid-column: 2; font-size: var(--ui-t-xs); color: var(--ui-texto-2); }
    .status.ocupado { color: var(--ui-marca-tinta); font-weight: 600; }
    .pedido { display: grid; gap: var(--ui-e3); }
    .texto { min-height: 7rem; padding: var(--ui-e3); resize: vertical; }
  `,
})
export class EscritorioPage {
  protected readonly store = inject(EscritorioStore);
  protected readonly form = inject(NonNullableFormBuilder).group({ entrada: [''] });
  protected readonly cor = corDoAgente;

  constructor() {
    // Movimento reduzido: o motor não anima a caminhada e o desenho não pisca
    const midia = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.store.reduzido = midia?.matches ?? false;
    const aoMudar = (e: MediaQueryListEvent) => (this.store.reduzido = e.matches);
    midia?.addEventListener?.('change', aoMudar);
    inject(DestroyRef).onDestroy(() => midia?.removeEventListener?.('change', aoMudar));

    void this.store.carregar();
  }

  protected async executar(codigo: string): Promise<void> {
    const entrada = this.form.controls.entrada.value;
    if (!entrada.trim()) {
      this.store.falha.set({ codigo, mensagem: 'Escreva o pedido antes de mandar o agente trabalhar.', irParaConfiguracoes: false });
      return;
    }
    await this.store.executar(codigo, entrada);
  }
}
