import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatarIntervalo } from '../../shared/util/formatos';
import { CenaEscritorio } from './cena-escritorio.component';
import { EquipeStore } from './data-access/equipe.store';
import { EscritorioStore } from './data-access/escritorio.store';
import { EquipeComponent } from './equipe.component';
import { acompanharMovimentoReduzido } from './movimento-reduzido';
import { SalaClaudeCode } from './sala-claude-code.component';

/**
 * Escritório com duas salas: "Claude Code" (as sessões reais do seu Claude Code, ao vivo — [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]])
 * e "Automações" (cada automação é um robô na sala). Ao disparar um fluxo, o robô anda até a mesa, mostra "pensando…" e, quando a API
 * responde, um balão com os tokens e o custo. Respeita prefers-reduced-motion (sem caminhada nem animações). [[Escritório Animado]]
 */
@Component({
  selector: 'app-escritorio',
  imports: [ReactiveFormsModule, RouterLink, CenaEscritorio, SalaClaudeCode, EquipeComponent],
  providers: [EquipeStore, EscritorioStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina larga">
      <h1 class="ui-titulo-pagina">Escritório</h1>

      <div class="abas" role="tablist" aria-label="Salas do escritório">
        <button type="button" role="tab" id="aba-claude" aria-controls="painel-sala" [attr.aria-selected]="aba() === 'claude'"
                (click)="aba.set('claude')">Claude Code (ao vivo)</button>
        <button type="button" role="tab" id="aba-automacoes" aria-controls="painel-sala" [attr.aria-selected]="aba() === 'automacoes'"
                (click)="aba.set('automacoes')">Automações</button>
        <button type="button" role="tab" id="aba-equipe" aria-controls="painel-sala" [attr.aria-selected]="aba() === 'equipe'"
                (click)="aba.set('equipe')">Equipe</button>
      </div>

      <div id="painel-sala" role="tabpanel" [attr.aria-labelledby]="'aba-' + (aba() === 'claude' ? 'claude' : aba() === 'equipe' ? 'equipe' : 'automacoes')">
      @if (aba() === 'claude') {
        <app-sala-claude-code />
      } @else if (aba() === 'equipe') {
        <app-equipe />
      } @else if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
        <button type="button" class="ui-botao" (click)="store.carregar()">Tentar de novo</button>
      } @else if (store.carregando() && !store.status().length) {
        <p class="ui-suave">Carregando…</p>
      } @else {
        <div class="layout">
          <section class="ui-cartao sala" aria-label="Sala dos agentes">
            <app-cena-escritorio [fonte]="store" [descricao]="store.descricao()" />
            <p class="ui-suave dica">Clique num robô (ou na lista) para escolher quem vai trabalhar.</p>
          </section>

          <section class="ui-cartao painel" aria-labelledby="titulo-agentes">
            <h2 id="titulo-agentes">Agentes</h2>
            <ul class="agentes" aria-label="Agentes">
              @for (s of store.status(); track s.codigo) {
                <li>
                  <button type="button" class="agente" [attr.aria-pressed]="s.codigo === store.selecionado()" (click)="store.selecionado.set(s.codigo)">
                    <span class="cor" [style.background]="store.visualDe(s.codigo).paleta.b" aria-hidden="true"></span>
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
                <div class="acoes-pedido">
                  <button type="submit" class="ui-botao ui-botao--primario" [disabled]="s.ocupado">
                    {{ s.ocupado ? s.apelido + ' está trabalhando…' : 'Mandar ' + s.apelido + ' trabalhar' }}
                  </button>
                  @if (s.cancelavel) {
                    <button type="button" class="ui-botao" [disabled]="store.cancelando() === s.codigo"
                            [attr.aria-label]="'Cancelar a tarefa de ' + s.apelido" (click)="store.cancelar(s.codigo)">
                      {{ store.cancelando() === s.codigo ? 'Cancelando…' : 'Cancelar' }}
                    </button>
                  }
                </div>
                @if (s.trabalhandoHa) {
                  <p class="ui-suave" role="timer">{{ s.apelido }} trabalha há {{ s.trabalhandoHa }}</p>
                }
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
            @if (store.ultimaExecucao(); as u) {
              <p class="ui-suave" data-testid="ultima-execucao">Última execução: {{ intervalo(u.iniciadaEm, u.finalizadaEm) }}</p>
              <p class="ui-suave"><a routerLink="/consumo/historico">Ver o resultado completo no histórico</a></p>
            }
          </section>
        </div>
        <p class="ui-visualmente-oculto" aria-live="polite">{{ store.anuncio() }}</p>
      }
      </div>
    </main>
  `,
  styles: `
    .larga { max-width: min(76rem, 100%); }
    .abas { display: flex; gap: var(--ui-e1); border-bottom: 1px solid var(--ui-linha); margin-bottom: var(--ui-e4); overflow-x: auto; }
    .abas button { padding: var(--ui-e2) var(--ui-e4); border: 0; border-bottom: 3px solid transparent; background: none; color: var(--ui-texto-2);
      font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .abas button[aria-selected='true'] { color: var(--ui-texto); border-bottom-color: var(--ui-marca); }
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
    .acoes-pedido { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
    .texto { min-height: 7rem; padding: var(--ui-e3); resize: vertical; }
  `,
})
export class EscritorioPage {
  protected readonly store = inject(EscritorioStore);
  protected readonly intervalo = formatarIntervalo;
  private readonly equipe = inject(EquipeStore);
  protected readonly form = inject(NonNullableFormBuilder).group({ entrada: [''] });
  /** A sala do Claude Code abre primeiro: é onde está o trabalho de verdade. */
  protected readonly aba = signal<'claude' | 'automacoes' | 'equipe'>('claude');

  constructor() {
    // Movimento reduzido: o motor não anima a caminhada e o desenho não pisca
    acompanharMovimentoReduzido((r) => (this.store.reduzido = r), inject(DestroyRef));
    // Cronômetro "trabalha há 12 s": um tique por segundo, só enquanto a página existe
    const relogio = setInterval(() => this.store.relogioMs.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(relogio));
    void this.equipe.carregar();
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
