import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { atualizarPeriodicamente } from '../../core/tempo-real/atualizacao-periodica';
import { formatarDolarCompacto, formatarNumero, formatarRenovacao } from '../../shared/util/formatos';
import { EscopoInicio } from './data-access/inicio.models';
import { InicioStore } from './data-access/inicio.store';
import { nivelDaJanela, ultimosDias } from './data-access/inicio.util';
import { MiniGrafico } from './mini-grafico.component';

/** Intervalo do polling do painel (o mesmo do Consumo). */
export const INTERVALO_INICIO_MS = 10_000;

/**
 * Início: o painel do dia. Números de hoje e do mês, o que está rodando agora no Claude Code (quem espera por você em destaque),
 * custo dos últimos 14 dias, quem mais gasta, barras da assinatura e dicas de economia. "Primeiros passos" só aparece enquanto
 * faltar algo (chave, Claude Code, uma automação). Automações (API) e Claude Code (assinatura) ficam separados de propósito:
 * o primeiro é dinheiro real, o segundo é o equivalente na API. [[Módulo Consumo]] · [[Módulo Sessoes]]
 */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink, MiniGrafico],
  providers: [InicioStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina">
      <div class="cabecalho">
        <h1 class="ui-titulo-pagina">Olá, {{ auth.primeiroNome() }}</h1>
        @if (ehAdmin()) {
          <div class="escopo" role="group" aria-label="De quem são os números">
            <button type="button" class="ui-botao" [attr.aria-pressed]="store.escopo() === 'MEU'" (click)="trocar('MEU')">Meus números</button>
            <button type="button" class="ui-botao" [attr.aria-pressed]="store.escopo() === 'TODOS'" (click)="trocar('TODOS')">Todos os usuários</button>
          </div>
        }
      </div>

      @if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }} Tentando de novo…</p>
      }

      @if (store.mostrarPassos()) {
        <section class="ui-cartao passos" aria-labelledby="titulo-passos">
          <h2 id="titulo-passos">Primeiros passos</h2>
          <ol>
            @for (p of store.passos(); track p.id) {
              <li [class.feito]="p.feito">
                <span class="marca" aria-hidden="true">{{ p.feito ? '✓' : '○' }}</span>
                <div>
                  <strong>{{ p.titulo }}</strong>
                  @if (p.feito) {
                    <span class="sr-only"> (feito)</span>
                  } @else {
                    <p class="ui-suave">{{ p.texto }}</p>
                    <a class="ui-botao" [routerLink]="p.rota">{{ p.acao }}</a>
                  }
                </div>
              </li>
            }
          </ol>
          <p class="ui-suave">Dúvidas? Veja a <a routerLink="/ajuda">Ajuda</a>.</p>
        </section>
      }

      <section class="kpis" aria-label="Resumo do dia">
        <article class="ui-cartao kpi" aria-label="Automações hoje">
          <h2>Automações (API) · hoje</h2>
          <p class="valor">{{ dolar(store.resumo()?.hoje?.custoUsd ?? 0) }}</p>
          <p class="ui-suave">{{ numero(store.resumo()?.hoje?.tokens ?? 0) }} tokens · {{ store.resumo()?.hoje?.chamadas ?? 0 }} chamadas</p>
        </article>
        <article class="ui-cartao kpi" aria-label="Automações no mês">
          <h2>Automações (API) · mês</h2>
          <p class="valor">{{ dolar(store.resumo()?.mes?.custoUsd ?? 0) }}</p>
          <p class="ui-suave">Dinheiro real, cobrado na sua chave</p>
        </article>
        <article class="ui-cartao kpi" aria-label="Claude Code hoje">
          <h2>Claude Code · hoje</h2>
          <p class="valor">≈ {{ dolar(store.code()?.hoje?.custoUsd ?? 0) }}</p>
          <p class="ui-suave">{{ store.code()?.hoje?.pedidos ?? 0 }} pedidos · equivalente na API</p>
        </article>
        <article class="ui-cartao kpi" aria-label="Claude Code no mês">
          <h2>Claude Code · mês</h2>
          <p class="valor">≈ {{ dolar(store.code()?.mes?.custoUsd ?? 0) }}</p>
          <p class="ui-suave">Na assinatura você não paga por token</p>
        </article>
      </section>

      @if (store.resumo(); as r) {
        @if (r.limiteMensalUsd !== undefined && store.escopo() === 'MEU') {
          <section [class]="'ui-cartao limite ' + store.estadoLimite()" aria-labelledby="titulo-limite">
            <div class="linha">
              <h2 id="titulo-limite">Limite do mês (automações)</h2>
              <span><strong>{{ r.percentualLimite ?? 0 }}%</strong> · {{ dolar(r.mes.custoUsd) }} de {{ dolar(r.limiteMensalUsd) }}</span>
            </div>
            <div class="trilho" role="progressbar" aria-label="Uso do limite do mês" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="minimo(r.percentualLimite ?? 0, 100)">
              <div class="uso" [style.width.%]="minimo(r.percentualLimite ?? 0, 100)"></div>
            </div>
            @if (store.estadoLimite() === 'estourado') {
              <p class="aviso">⛔ Limite atingido: as automações estão bloqueadas.</p>
            } @else if (store.estadoLimite() === 'alerta') {
              <p class="aviso">⚠️ Acima de 80% do limite.</p>
            }
          </section>
        }
      }

      <section [class]="'ui-cartao agora' + (store.agora().esperando ? ' espera' : '')" aria-labelledby="titulo-agora">
        <div class="linha">
          <h2 id="titulo-agora">Agora no Claude Code</h2>
          <a routerLink="/escritorio">Abrir o Escritório</a>
        </div>
        @if (store.agora().ativas === 0) {
          <p class="ui-suave">Nenhuma sessão ativa. Abra o Claude Code no seu computador (conectado em Configurações) e o robô aparece aqui.</p>
        } @else {
          <p>
            <strong>{{ store.agora().trabalhando }}</strong> trabalhando · <strong>{{ store.agora().esperando }}</strong> esperando por você ·
            {{ store.agora().ativas }} ativa{{ store.agora().ativas === 1 ? '' : 's' }}
          </p>
          @if (store.agora().esperando) {
            <p class="aviso" role="status">✋ Precisa de você em: {{ store.agora().salasEsperando.join(', ') }}. <a routerLink="/escritorio">Aprovar ou negar</a></p>
          }
        }
      </section>

      <div class="graficos">
        <section class="ui-cartao" aria-labelledby="titulo-g-api">
          <h3 id="titulo-g-api">Automações (API) · últimos 14 dias</h3>
          <app-mini-grafico [pontos]="pontosApi()" />
        </section>
        <section class="ui-cartao" aria-labelledby="titulo-g-code">
          <h3 id="titulo-g-code">Claude Code (≈ equivalente) · últimos 14 dias</h3>
          <app-mini-grafico [pontos]="pontosCode()" prefixo="≈ " />
        </section>
      </div>

      <div class="graficos">
        <section class="ui-cartao" aria-labelledby="titulo-top-api">
          <h3 id="titulo-top-api">Quem mais gasta · automações</h3>
          @if (store.resumo()?.ranking?.length) {
            <ol class="ranking">
              @for (i of topAutomacoes(); track i.automacaoId ?? i.nome) {
                <li><span>{{ i.nome }}</span><span class="ui-suave">{{ dolar(i.custoUsd) }} · {{ i.chamadas }} chamada{{ i.chamadas === 1 ? '' : 's' }}</span></li>
              }
            </ol>
          } @else {
            <p class="ui-suave">Sem chamadas no período.</p>
          }
        </section>
        <section class="ui-cartao" aria-labelledby="titulo-top-code">
          <h3 id="titulo-top-code">Quem mais gasta · projetos do Claude Code</h3>
          @if (store.code()?.projetos?.length) {
            <ol class="ranking">
              @for (i of topProjetos(); track i.nome) {
                <li><span>{{ i.nome }}</span><span class="ui-suave">≈ {{ dolar(i.uso.custoUsd) }} · {{ i.uso.pedidos }} pedidos</span></li>
              }
            </ol>
          } @else {
            <p class="ui-suave">Sem sessões no período.</p>
          }
        </section>
      </div>

      @if (barras().length || dicas().length) {
        <div class="graficos">
          @if (barras().length) {
            <section class="ui-cartao" aria-labelledby="titulo-assinatura">
              <h3 id="titulo-assinatura">Uso da assinatura</h3>
              <ul class="janelas">
                @for (b of barras(); track b.rotulo) {
                  <li>
                    <div class="linha"><strong>{{ b.rotulo }}</strong><span><strong>{{ b.percentual }}%</strong> · renova {{ b.renova }}</span></div>
                    <div class="trilho" role="progressbar" [attr.aria-label]="'Uso da janela de ' + b.rotulo" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="b.percentual">
                      <div [class]="'uso ' + b.nivel" [style.width.%]="b.percentual"></div>
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
          @if (dicas().length) {
            <section class="ui-cartao" aria-labelledby="titulo-dicas">
              <h3 id="titulo-dicas">Dicas para gastar menos</h3>
              <ul class="dicas">
                @for (d of dicas(); track d.regra + d.titulo) {
                  <li><strong>{{ d.titulo }}</strong><p class="ui-suave">{{ d.texto }}</p></li>
                }
              </ul>
              <a routerLink="/consumo">Ver todas em Consumo</a>
            </section>
          }
        </div>
      }

      <nav class="atalhos" aria-label="Atalhos">
        <a class="ui-botao" routerLink="/automacoes">Automações</a>
        <a class="ui-botao" routerLink="/escritorio">Escritório</a>
        <a class="ui-botao" routerLink="/consumo">Consumo</a>
        <a class="ui-botao" routerLink="/configuracoes">Configurações</a>
        <a class="ui-botao" routerLink="/ajuda">Ajuda</a>
      </nav>
    </main>
  `,
  styles: `
    .cabecalho { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: var(--ui-e2); }
    .escopo { display: flex; gap: var(--ui-e2); margin-bottom: var(--ui-e3); }
    .escopo [aria-pressed='true'] { background: var(--ui-marca); color: var(--ui-marca-texto); border-color: var(--ui-marca); }
    h2 { font-size: var(--ui-t-sm); color: var(--ui-texto-2); font-weight: 600; }
    h3 { font-size: var(--ui-t-md); margin-bottom: var(--ui-e3); }
    .passos { display: grid; gap: var(--ui-e3); margin-bottom: var(--ui-e4); }
    .passos h2 { font-size: var(--ui-t-lg); color: var(--ui-texto); }
    .passos ol { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e3); }
    .passos li { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); gap: var(--ui-e2); }
    .passos li > div { display: grid; gap: var(--ui-e1); justify-items: start; }
    .passos li.feito { opacity: 0.6; }
    .kpis { display: grid; gap: var(--ui-e3); grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: var(--ui-e4); }
    .kpi { display: grid; gap: var(--ui-e1); }
    .valor { font-size: var(--ui-t-xl); font-weight: 750; font-variant-numeric: tabular-nums; }
    .limite, .agora { display: grid; gap: var(--ui-e2); margin-bottom: var(--ui-e4); }
    .limite.alerta, .limite.estourado, .agora.espera { background: var(--ui-alerta-fundo); }
    .linha { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--ui-e2); align-items: baseline; }
    .trilho { height: 10px; border-radius: 999px; background: var(--ui-superficie-2); overflow: hidden; }
    .uso { height: 100%; border-radius: 999px; background: var(--ui-grafico); }
    .uso.atencao { background: #f08c00; }
    .uso.critico, .estourado .uso { background: #c92a2a; }
    .aviso { font-weight: 600; }
    .graficos { display: grid; gap: var(--ui-e4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); margin-bottom: var(--ui-e4); }
    .ranking, .janelas, .dicas { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e3); }
    .ranking li { display: grid; gap: 2px; }
    .janelas li { display: grid; gap: 4px; }
    .atalhos { display: flex; flex-wrap: wrap; gap: var(--ui-e2); margin-top: var(--ui-e4); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `,
})
export class InicioPage {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(InicioStore);

  protected readonly ehAdmin = computed(() => this.auth.usuario()?.perfil === 'ADMIN');
  protected readonly pontosApi = computed(() => ultimosDias(this.store.resumo()?.porDia ?? [], 14).map((d) => ({ dia: d.dia, valor: d.custoUsd })));
  protected readonly pontosCode = computed(() => ultimosDias(this.store.code()?.serie ?? [], 14).map((d) => ({ dia: d.dia, valor: d.uso.custoUsd })));
  protected readonly topAutomacoes = computed(() => (this.store.resumo()?.ranking ?? []).slice(0, 5));
  protected readonly topProjetos = computed(() => (this.store.code()?.projetos ?? []).slice(0, 5));
  protected readonly dicas = computed(() => (this.store.dicas()?.dicas ?? []).slice(0, 3));
  protected readonly barras = computed(() => {
    const l = this.store.limites();
    const lista: { rotulo: string; percentual: number; nivel: string; renova: string }[] = [];
    for (const [rotulo, j] of [['5 horas', l?.cincoHoras], ['semana', l?.semana]] as const) {
      if (j) lista.push({ rotulo, percentual: Math.round(j.percentual), nivel: nivelDaJanela(j.percentual), renova: formatarRenovacao(j.renovaEm) });
    }
    return lista;
  });

  protected readonly dolar = formatarDolarCompacto;
  protected readonly numero = formatarNumero;
  protected readonly minimo = Math.min;

  constructor() {
    atualizarPeriodicamente(() => this.store.atualizar(), { intervaloMs: INTERVALO_INICIO_MS }, inject(DestroyRef));
  }

  protected trocar(escopo: EscopoInicio): void {
    void this.store.trocarEscopo(escopo);
  }
}
