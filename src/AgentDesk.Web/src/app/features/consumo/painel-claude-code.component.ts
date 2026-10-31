import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { atualizarPeriodicamente } from '../../core/tempo-real/atualizacao-periodica';
import { formatarData, formatarDataHora, formatarDolarCompacto, formatarNumero, formatarPercentual } from '../../shared/util/formatos';
import { ClaudeCodeStore } from './data-access/claude-code.store';
import { EscopoClaudeCode, ItemClaudeCode, UsoClaudeCode } from './data-access/claude-code.models';
import { GraficoDias } from './grafico-dias.component';

/** Intervalo do polling (o mesmo do painel de automações). */
export const INTERVALO_CLAUDE_CODE_MS = 10_000;

/**
 * Aba "Claude Code (assinatura)" da tela Consumo: tokens e ≈ US$ das sessões reais do Claude Code (hoje, mês, acumulado), custo por
 * dia, rankings por projeto e por modelo com a taxa de cache (destaque quando baixa), ferramentas mais usadas e cache por dia.
 * Na assinatura você não paga por token: o US$ é o que as chamadas custariam na API. [[Módulo Sessoes]]
 */
@Component({
  selector: 'app-painel-claude-code',
  imports: [RouterLink, GraficoDias, NgTemplateOutlet],
  providers: [ClaudeCodeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.erro()) {
      <p class="ui-erro" role="alert">{{ store.erro() }} Tentando de novo…</p>
    }

    @if (store.painel(); as p) {
      <section class="kpis" aria-label="Totais do Claude Code">
        @for (k of kpis(); track k.rotulo) {
          <article class="ui-cartao kpi" [attr.aria-label]="'Claude Code · ' + k.rotulo">
            <h2>{{ k.rotulo }}</h2>
            <p class="valor">≈ {{ dolar(k.uso.custoUsd) }}</p>
            <p class="ui-suave">{{ numero(k.uso.tokens) }} tokens · {{ k.uso.pedidos }} pedido{{ k.uso.pedidos === 1 ? '' : 's' }}</p>
            <p [class]="'cache ' + (k.uso.cacheBaixo ? 'baixo' : 'ok')">{{ textoCache(k.uso) }}</p>
          </article>
        }
      </section>

      @if (!store.temDados()) {
        <section class="ui-cartao vazio">
          <h2>Nenhum uso do Claude Code ainda</h2>
          <p class="ui-suave">Conecte o Claude Code do seu computador e use-o: os tokens aparecem aqui em segundos.</p>
          <a class="ui-botao ui-botao--primario" routerLink="/configuracoes" fragment="claude-code">Conectar o Claude Code</a>
        </section>
      }

      <div class="graficos">
        <section class="ui-cartao">
          <app-grafico-dias [dias]="store.serieParaGrafico()" [titulo]="'≈ Custo por dia — últimos ' + p.dias + ' dias (US$)'" />
        </section>

        <section class="ui-cartao" aria-labelledby="titulo-cache-dia">
          <h3 id="titulo-cache-dia">Cache por dia</h3>
          @if (store.diasComUso().length) {
            <ul class="lista-simples">
              @for (d of store.diasComUso(); track d.dia) {
                <li>
                  <span>{{ dia(d.dia) }}</span>
                  <span [class]="d.uso.cacheBaixo ? 'baixo' : ''">
                    {{ d.uso.cacheBaixo ? '⚠ ' : '' }}{{ percentual(d.uso.taxaCache) || '—' }}
                    <small class="ui-suave">· {{ d.uso.pedidos }} pedido{{ d.uso.pedidos === 1 ? '' : 's' }}</small>
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="ui-suave">Sem uso no período.</p>
          }
          <p class="ui-suave dica">Cache = quanto do contexto foi reaproveitado em vez de reenviado. Abaixo de 60% (com 5+ pedidos) é destaque: é o maior desperdício de tokens.</p>
        </section>
      </div>

      <div class="graficos pares">
        <section class="ui-cartao" aria-labelledby="titulo-projetos">
          <h3 id="titulo-projetos">Ranking por projeto — últimos {{ p.dias }} dias</h3>
          <ng-container *ngTemplateOutlet="ranking; context: { itens: p.projetos, vazio: 'Sem projetos no período.' }" />
        </section>
        <section class="ui-cartao" aria-labelledby="titulo-modelos">
          <h3 id="titulo-modelos">Ranking por modelo — últimos {{ p.dias }} dias</h3>
          <ng-container *ngTemplateOutlet="ranking; context: { itens: p.modelos, vazio: 'Sem modelos no período.' }" />
        </section>
      </div>

      <section class="ui-cartao" aria-labelledby="titulo-ferramentas">
        <h3 id="titulo-ferramentas">Ferramentas mais usadas</h3>
        @if (p.ferramentas.length) {
          <ol class="ranking">
            @for (f of p.ferramentas; track f.ferramenta) {
              <li>
                <div class="linha"><span class="nome">{{ f.ferramenta }}</span><span class="ui-suave">{{ numero(f.usos) }} uso{{ f.usos === 1 ? '' : 's' }}</span></div>
                <div class="trilho fino" aria-hidden="true"><div class="uso" [style.width.%]="proporcaoFerramenta(f.usos)"></div></div>
              </li>
            }
          </ol>
        } @else {
          <p class="ui-suave">Sem ferramentas registradas no período.</p>
        }
        <p class="ui-suave dica">É a contagem de usos (vem dos hooks). A telemetria informa tokens por pedido ao modelo, não por ferramenta, então não há rateio de tokens aqui.</p>
      </section>

      <p class="ui-suave atualizado" aria-live="off">
        Atualizado em {{ dataHora(p.atualizadoEm) }} · atualiza sozinho a cada 10 s · ≈ US$ é o que as chamadas custariam na API
      </p>
    } @else if (!store.erro()) {
      <p class="ui-suave">Carregando…</p>
    }

    <ng-template #ranking let-itens="itens" let-vazio="vazio">
      @if (itens.length) {
        <ol class="ranking">
          @for (item of itens; track item.nome) {
            <li>
              <div class="linha">
                <span class="nome">{{ item.nome }}</span>
                <span class="ui-suave">≈ {{ dolar(item.uso.custoUsd) }}</span>
              </div>
              <div class="trilho fino" aria-hidden="true"><div class="uso" [style.width.%]="proporcao(itens, item)"></div></div>
              <small class="ui-suave">
                {{ item.uso.pedidos }} pedido{{ item.uso.pedidos === 1 ? '' : 's' }} · {{ numero(item.uso.tokens) }} tokens ·
                <span [class]="item.uso.cacheBaixo ? 'baixo' : ''">{{ textoCache(item.uso) }}</span>
              </small>
            </li>
          }
        </ol>
      } @else {
        <p class="ui-suave">{{ vazio }}</p>
      }
    </ng-template>
  `,
  styles: `
    :host { display: block; }
    h2 { font-size: var(--ui-t-sm); color: var(--ui-texto-2); font-weight: 600; }
    h3 { font-size: var(--ui-t-md); margin-bottom: var(--ui-e3); }
    .kpis { display: grid; gap: var(--ui-e3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); margin-bottom: var(--ui-e4); }
    .kpi { display: grid; gap: var(--ui-e1); }
    .valor { font-size: var(--ui-t-xl); font-weight: 750; font-variant-numeric: tabular-nums; }
    .cache { font-size: var(--ui-t-xs); color: var(--ui-texto-2); }
    .baixo { color: #c92a2a; font-weight: 700; }
    .vazio { display: grid; gap: var(--ui-e2); justify-items: start; margin-bottom: var(--ui-e4); }
    .graficos { display: grid; gap: var(--ui-e4); grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); margin-bottom: var(--ui-e4); }
    .graficos.pares { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (max-width: 900px) { .graficos, .graficos.pares { grid-template-columns: minmax(0, 1fr); } }
    .linha { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--ui-e2); align-items: baseline; }
    .trilho { height: 10px; border-radius: 999px; background: var(--ui-superficie-2); overflow: hidden; }
    .trilho.fino { height: 6px; }
    .uso { height: 100%; border-radius: 999px; background: var(--ui-grafico); }
    .ranking { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e3); }
    .ranking li { display: grid; gap: 4px; }
    .nome { font-weight: 600; overflow-wrap: anywhere; }
    .lista-simples { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); }
    .lista-simples li { display: flex; justify-content: space-between; gap: var(--ui-e2); }
    .dica { font-size: var(--ui-t-xs); margin-top: var(--ui-e3); }
    .atualizado { margin-top: var(--ui-e4); font-size: var(--ui-t-xs); }
    section.ui-cartao + section.ui-cartao { margin-top: 0; }
  `,
})
export class PainelClaudeCode {
  protected readonly store = inject(ClaudeCodeStore);
  readonly escopo = input<EscopoClaudeCode>('MEU');

  protected readonly kpis = computed(() => {
    const p = this.store.painel();
    return p ? [{ rotulo: 'Hoje', uso: p.hoje }, { rotulo: 'Este mês', uso: p.mes }, { rotulo: 'Acumulado', uso: p.acumulado }] : [];
  });
  private readonly maiorFerramenta = computed(() => Math.max(0, ...(this.store.painel()?.ferramentas.map((f) => f.usos) ?? [])));

  protected readonly dolar = formatarDolarCompacto;
  protected readonly numero = formatarNumero;
  protected readonly dataHora = formatarDataHora;
  protected readonly dia = (iso: string) => formatarData(`${iso}T12:00:00-03:00`);
  protected readonly percentual = formatarPercentual;
  protected readonly textoCache = (u: UsoClaudeCode) =>
    u.taxaCache === undefined ? 'cache: sem dados' : `${u.cacheBaixo ? '⚠ ' : ''}cache ${formatarPercentual(u.taxaCache)}${u.cacheBaixo ? ' (baixo)' : ''}`;
  protected readonly proporcao = (itens: ItemClaudeCode[], item: ItemClaudeCode) => {
    const maior = Math.max(0, ...itens.map((i) => i.uso.custoUsd));
    return maior > 0 ? Math.max(2, (item.uso.custoUsd / maior) * 100) : 0;
  };
  protected readonly proporcaoFerramenta = (usos: number) => (this.maiorFerramenta() > 0 ? Math.max(2, (usos / this.maiorFerramenta()) * 100) : 0);

  constructor() {
    // Trocar o escopo (Meu/Todos) busca na hora; depois o polling mantém atualizado
    effect(() => void this.store.atualizar(this.escopo()).catch(() => undefined));
    atualizarPeriodicamente(() => this.store.atualizar(this.escopo()), { intervaloMs: INTERVALO_CLAUDE_CODE_MS }, inject(DestroyRef));
  }
}
