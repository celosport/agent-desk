import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { atualizarPeriodicamente } from '../../core/tempo-real/atualizacao-periodica';
import { formatarDataHora, formatarDolarCompacto, formatarNumero } from '../../shared/util/formatos';
import { EscopoConsumo, Totais } from './data-access/consumo.models';
import { PainelStore } from './data-access/painel.store';
import { GraficoDias } from './grafico-dias.component';
import { PainelClaudeCode } from './painel-claude-code.component';

/** Intervalo do polling do painel (decisão do projeto: 10 s). */
export const INTERVALO_PAINEL_MS = 10_000;

/**
 * Painel de consumo: totais do dia, do mês e acumulado, custo por dia e ranking por automação, atualizado por polling
 * (core/tempo-real; pausa com a aba em segundo plano). O ADMIN alterna entre "Meu consumo" e "Todos". [[Módulo Consumo]]
 */
@Component({
  selector: 'app-painel-consumo',
  imports: [RouterLink, GraficoDias, PainelClaudeCode],
  providers: [PainelStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina">
      <div class="cabecalho">
        <h1 class="ui-titulo-pagina">Consumo</h1>
        <a class="ui-botao" routerLink="/consumo/historico">Ver histórico</a>
      </div>

      @if (ehAdmin()) {
        <div class="escopo" role="group" aria-label="De quem é o consumo">
          <button type="button" class="ui-botao" [attr.aria-pressed]="store.escopo() === 'MEU'" (click)="trocar('MEU')">Meu consumo</button>
          <button type="button" class="ui-botao" [attr.aria-pressed]="store.escopo() === 'TODOS'" (click)="trocar('TODOS')">Todos os usuários</button>
        </div>
      }

      <div class="abas" role="tablist" aria-label="Origem do consumo">
        <button type="button" role="tab" id="aba-api" aria-controls="painel-consumo" [attr.aria-selected]="aba() === 'api'"
                (click)="aba.set('api')">Automações (API)</button>
        <button type="button" role="tab" id="aba-cc" aria-controls="painel-consumo" [attr.aria-selected]="aba() === 'claude-code'"
                (click)="aba.set('claude-code')">Claude Code (assinatura)</button>
      </div>

      <div id="painel-consumo" role="tabpanel" [attr.aria-labelledby]="aba() === 'api' ? 'aba-api' : 'aba-cc'">
      @if (aba() === 'claude-code') {
        <app-painel-claude-code [escopo]="store.escopo()" />
      } @else {
      @if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }} Tentando de novo…</p>
      }

      @if (store.resumo(); as r) {
        <section class="kpis" aria-label="Totais">
          @for (k of kpis(); track k.rotulo) {
            <article class="ui-cartao kpi" [attr.aria-label]="k.rotulo">
              <h2>{{ k.rotulo }}</h2>
              <p class="valor">{{ dolar(k.totais.custoUsd) }}</p>
              <p class="ui-suave">{{ numero(k.totais.tokens) }} tokens · {{ k.totais.chamadas }} chamada{{ k.totais.chamadas === 1 ? '' : 's' }}</p>
            </article>
          }
        </section>

        @if (r.limiteMensalUsd !== undefined) {
          <section [class]="'ui-cartao limite ' + store.estadoLimite()" aria-labelledby="titulo-limite">
            <div class="linha">
              <h2 id="titulo-limite">Limite do mês</h2>
              <span><strong>{{ r.percentualLimite }}%</strong> · {{ dolar(r.mes.custoUsd) }} de {{ dolar(r.limiteMensalUsd) }}</span>
            </div>
            <div class="trilho" role="progressbar" aria-label="Uso do limite do mês" aria-valuemin="0" aria-valuemax="100"
                 [attr.aria-valuenow]="minimo(r.percentualLimite ?? 0, 100)">
              <div class="uso" [style.width.%]="minimo(r.percentualLimite ?? 0, 100)"></div>
            </div>
            @if (store.estadoLimite() === 'estourado') {
              <p class="aviso">⛔ Limite atingido.</p>
            } @else if (store.estadoLimite() === 'alerta') {
              <p class="aviso">⚠️ Acima de 80% do limite.</p>
            }
          </section>
        }

        @if (!store.temDados()) {
          <section class="ui-cartao vazio">
            <h2>Nenhuma chamada ainda</h2>
            <p class="ui-suave">Rode uma automação e o consumo aparece aqui em segundos.</p>
            <a class="ui-botao ui-botao--primario" routerLink="/automacoes">Abrir Automações</a>
          </section>
        }

        <div class="graficos">
          <section class="ui-cartao">
            <app-grafico-dias [dias]="r.porDia" [titulo]="'Custo por dia — últimos ' + r.dias + ' dias'" />
          </section>

          <section class="ui-cartao" aria-labelledby="titulo-ranking">
            <h3 id="titulo-ranking">Ranking por automação — últimos {{ r.dias }} dias</h3>
            @if (r.ranking.length) {
              <ol class="ranking">
                @for (item of r.ranking; track item.automacaoId ?? item.nome) {
                  <li>
                    <div class="linha">
                      <span class="nome">{{ item.nome }}</span>
                      <span class="ui-suave">{{ dolar(item.custoUsd) }}</span>
                    </div>
                    <div class="trilho fino" aria-hidden="true"><div class="uso" [style.width.%]="proporcao(item.custoUsd)"></div></div>
                    <small class="ui-suave">{{ item.chamadas }} chamada{{ item.chamadas === 1 ? '' : 's' }} · {{ numero(item.tokens) }} tokens</small>
                  </li>
                }
              </ol>
            } @else {
              <p class="ui-suave">Sem chamadas no período.</p>
            }
          </section>
        </div>

        <p class="ui-suave atualizado" aria-live="off">Atualizado em {{ dataHora(r.atualizadoEm) }} · atualiza sozinho a cada 10 s</p>
      } @else if (!store.erro()) {
        <p class="ui-suave">Carregando…</p>
      }
      }
      </div>
    </main>
  `,
  styles: `
    .cabecalho { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: var(--ui-e2); }
    .abas { display: flex; gap: var(--ui-e1); border-bottom: 1px solid var(--ui-linha); margin-bottom: var(--ui-e4); overflow-x: auto; }
    .abas button { padding: var(--ui-e2) var(--ui-e4); border: 0; border-bottom: 3px solid transparent; background: none; color: var(--ui-texto-2);
      font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .abas button[aria-selected='true'] { color: var(--ui-texto); border-bottom-color: var(--ui-marca); }
    .escopo { display: flex; gap: var(--ui-e2); margin-bottom: var(--ui-e4); }
    .escopo [aria-pressed='true'] { background: var(--ui-marca); color: var(--ui-marca-texto); border-color: var(--ui-marca); }
    h2 { font-size: var(--ui-t-sm); color: var(--ui-texto-2); font-weight: 600; }
    h3 { font-size: var(--ui-t-md); margin-bottom: var(--ui-e3); }
    .kpis { display: grid; gap: var(--ui-e3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); margin-bottom: var(--ui-e4); }
    .kpi { display: grid; gap: var(--ui-e1); }
    .valor { font-size: var(--ui-t-xl); font-weight: 750; font-variant-numeric: tabular-nums; }
    .limite { display: grid; gap: var(--ui-e2); margin-bottom: var(--ui-e4); }
    .limite.alerta, .limite.estourado { background: var(--ui-alerta-fundo); }
    .linha { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--ui-e2); align-items: baseline; }
    .trilho { height: 10px; border-radius: 999px; background: var(--ui-superficie-2); overflow: hidden; }
    .trilho.fino { height: 6px; }
    .uso { height: 100%; border-radius: 999px; background: var(--ui-grafico); }
    .estourado .uso { background: var(--ui-vermelho); }
    .aviso { font-weight: 600; }
    .vazio { display: grid; gap: var(--ui-e2); justify-items: start; margin-bottom: var(--ui-e4); }
    .graficos { display: grid; gap: var(--ui-e4); grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
    @media (max-width: 900px) { .graficos { grid-template-columns: minmax(0, 1fr); } }
    .ranking { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e3); }
    .ranking li { display: grid; gap: 4px; }
    .nome { font-weight: 600; }
    .atualizado { margin-top: var(--ui-e4); font-size: var(--ui-t-xs); }
  `,
})
export class PainelPage {
  protected readonly store = inject(PainelStore);
  protected readonly aba = signal<'api' | 'claude-code'>('api');
  private readonly auth = inject(AuthStore);

  protected readonly ehAdmin = computed(() => this.auth.usuario()?.perfil === 'ADMIN');
  protected readonly kpis = computed(() => {
    const r = this.store.resumo();
    if (!r) return [];
    const lista: { rotulo: string; totais: Totais }[] = [
      { rotulo: 'Hoje', totais: r.hoje },
      { rotulo: 'Este mês', totais: r.mes },
      { rotulo: 'Acumulado', totais: r.acumulado },
    ];
    return lista;
  });
  private readonly maiorRanking = computed(() => Math.max(0, ...(this.store.resumo()?.ranking.map((i) => i.custoUsd) ?? [])));

  protected readonly dolar = formatarDolarCompacto;
  protected readonly numero = formatarNumero;
  protected readonly dataHora = formatarDataHora;
  protected readonly minimo = Math.min;
  protected readonly proporcao = (v: number) => (this.maiorRanking() > 0 ? Math.max(2, (v / this.maiorRanking()) * 100) : 0);

  constructor() {
    atualizarPeriodicamente(() => this.store.atualizar(), { intervaloMs: INTERVALO_PAINEL_MS }, inject(DestroyRef));
  }

  protected trocar(escopo: EscopoConsumo): void {
    void this.store.trocarEscopo(escopo);
  }
}
