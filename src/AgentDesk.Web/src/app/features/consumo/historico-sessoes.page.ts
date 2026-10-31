import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import {
  formatarDataHora,
  formatarDolarCompacto,
  formatarDuracao,
  formatarNumero,
  formatarPercentual,
} from '../../shared/util/formatos';
import { SessaoHistorico, StatusSessao } from './data-access/claude-code.models';
import { HistoricoSessoesStore } from './data-access/historico-sessoes.store';

const STATUS: Record<StatusSessao, string> = {
  TRABALHANDO: 'Trabalhando',
  ESPERANDO_VOCE: 'Precisa de você',
  OCIOSA: 'Ociosa',
  ENCERRADA: 'Encerrada',
};

/**
 * Histórico das sessões do Claude Code dos últimos 90 dias: duração, pedidos, tokens, ≈ US$ e taxa de cache, com filtro por projeto e
 * período. Clicar numa sessão abre a linha do tempo com o que ela fez, hora a hora. O ADMIN alterna entre "Meu" e "Todos". [[Módulo Sessoes]]
 */
@Component({
  selector: 'app-historico-sessoes',
  imports: [ReactiveFormsModule, RouterLink],
  providers: [HistoricoSessoesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina larga">
      <div class="cabecalho">
        <h1 class="ui-titulo-pagina">Histórico de sessões</h1>
        <a class="ui-botao" routerLink="/consumo">Voltar ao consumo</a>
      </div>

      @if (ehAdmin()) {
        <div class="escopo" role="group" aria-label="De quem são as sessões">
          <button type="button" class="ui-botao" [attr.aria-pressed]="store.filtro().escopo === 'MEU'" (click)="trocar('MEU')">Minhas sessões</button>
          <button type="button" class="ui-botao" [attr.aria-pressed]="store.filtro().escopo === 'TODOS'" (click)="trocar('TODOS')">Todos os usuários</button>
        </div>
      }

      <form class="filtros ui-cartao" [formGroup]="form" (ngSubmit)="filtrar()" novalidate>
        <div class="ui-campo"><label for="f-projeto">Projeto</label>
          <select id="f-projeto" class="ui-entrada" formControlName="projeto">
            <option value="">Todos</option>
            @for (p of store.pagina()?.projetos ?? []; track p.chave) {
              <option [value]="p.chave">{{ p.nome }}</option>
            }
          </select></div>
        <div class="ui-campo"><label for="f-de">De</label><input id="f-de" class="ui-entrada" type="date" formControlName="de" /></div>
        <div class="ui-campo"><label for="f-ate">Até</label><input id="f-ate" class="ui-entrada" type="date" formControlName="ate" /></div>
        <div class="acoes">
          <button type="submit" class="ui-botao ui-botao--primario">Filtrar</button>
          <button type="button" class="ui-botao ui-botao--fantasma" (click)="limpar()">Limpar</button>
        </div>
      </form>

      @if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
      }

      @if (store.pagina(); as p) {
        <p class="resumo" role="status">{{ p.total }} sessõ{{ p.total === 1 ? 'o' : 'es' }} nos últimos 90 dias</p>

        @if (!p.itens.length) {
          <section class="ui-cartao vazio"><p class="ui-suave">Nenhuma sessão com estes filtros.</p></section>
        } @else {
          <div class="rolagem">
            <table role="table" aria-label="Sessões do Claude Code">
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">Início</th>
                  @if (mostrarUsuario()) { <th role="columnheader" scope="col">Usuário</th> }
                  <th role="columnheader" scope="col">Projeto</th>
                  <th role="columnheader" scope="col">Duração</th>
                  <th role="columnheader" scope="col">Pedidos</th>
                  <th role="columnheader" scope="col">Tokens</th>
                  <th role="columnheader" scope="col">≈ US$</th>
                  <th role="columnheader" scope="col">Cache</th>
                  <th role="columnheader" scope="col">Status</th>
                  <th role="columnheader" scope="col"><span class="ui-visualmente-oculto">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                @for (s of p.itens; track s.usuarioId + s.sessaoId) {
                  <tr role="row" [class.aberta]="store.linha()?.sessao?.sessaoId === s.sessaoId">
                    <td role="cell" data-rotulo="Início">{{ dataHora(s.iniciadaEm) }}</td>
                    @if (mostrarUsuario()) { <td role="cell" data-rotulo="Usuário">{{ s.usuarioNome ?? '—' }}</td> }
                    <td role="cell" data-rotulo="Projeto">{{ s.projeto }}<small class="ui-suave bloco">{{ s.modelo ?? '' }}</small></td>
                    <td role="cell" data-rotulo="Duração">{{ duracao(s.duracaoMs) }}</td>
                    <td role="cell" data-rotulo="Pedidos">{{ s.uso.pedidos }}</td>
                    <td role="cell" data-rotulo="Tokens">{{ numero(s.uso.tokens) }}</td>
                    <td role="cell" data-rotulo="≈ US$">{{ dolar(s.uso.custoUsd) }}</td>
                    <td role="cell" data-rotulo="Cache" [class.baixo]="s.uso.cacheBaixo">{{ s.uso.taxaCache === undefined ? '—' : (s.uso.cacheBaixo ? '⚠ ' : '') + percentual(s.uso.taxaCache) }}</td>
                    <td role="cell" data-rotulo="Status">{{ status[s.status] }}</td>
                    <td role="cell">
                      <button type="button" class="ui-botao" [attr.aria-label]="'Ver linha do tempo de ' + descricao(s)" (click)="store.abrir(s)">Linha do tempo</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (store.totalPaginas() > 1) {
            <nav class="paginacao" aria-label="Páginas">
              <button type="button" class="ui-botao" [disabled]="p.pagina <= 1" (click)="store.irParaPagina(p.pagina - 1)">Anterior</button>
              <span>Página {{ p.pagina }} de {{ store.totalPaginas() }}</span>
              <button type="button" class="ui-botao" [disabled]="p.pagina >= store.totalPaginas()" (click)="store.irParaPagina(p.pagina + 1)">Próxima</button>
            </nav>
          }
        }
      } @else if (!store.erro()) {
        <p class="ui-suave">Carregando…</p>
      }

      @if (store.erroLinha()) {
        <p class="ui-erro" role="alert">{{ store.erroLinha() }}</p>
      }
      @if (store.linha(); as l) {
        <section class="ui-cartao linha" aria-labelledby="titulo-linha">
          <div class="linha-topo">
            <h2 id="titulo-linha">{{ l.sessao.projeto }} · {{ dataHora(l.sessao.iniciadaEm) }} · {{ duracao(l.sessao.duracaoMs) }}</h2>
            <button type="button" class="ui-botao ui-botao--fantasma" (click)="store.fechar()">Fechar</button>
          </div>
          @for (g of store.grupos(); track g.rotulo + $index) {
            <h3 class="hora">{{ g.rotulo }}</h3>
            <ol class="eventos" [attr.aria-label]="'Eventos das ' + g.rotulo">
              @for (e of g.itens; track $index) {
                <li [class]="'ev ' + e.tipo.toLowerCase()"><time>{{ e.hora }}</time><span>{{ e.texto }}</span></li>
              }
            </ol>
          } @empty {
            <p class="ui-suave">Esta sessão não tem eventos guardados (a linha do tempo fica 90 dias).</p>
          }
          @if (l.cortada) {
            <p class="ui-suave">A linha do tempo foi cortada nos primeiros 1.000 eventos.</p>
          }
        </section>
      }
    </main>
  `,
  styles: `
    .larga { max-width: min(76rem, 100%); }
    .cabecalho { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: var(--ui-e2); }
    .escopo { display: flex; gap: var(--ui-e2); margin-bottom: var(--ui-e4); }
    .escopo [aria-pressed='true'] { background: var(--ui-marca); color: var(--ui-marca-texto); border-color: var(--ui-marca); }
    .filtros { display: grid; gap: var(--ui-e3); grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); align-items: end; margin-bottom: var(--ui-e4); }
    .acoes { display: flex; gap: var(--ui-e2); }
    .resumo { margin-bottom: var(--ui-e3); font-weight: 600; }
    .rolagem { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: var(--ui-t-sm); }
    th, td { padding: var(--ui-e2) var(--ui-e3); text-align: left; border-bottom: 1px solid var(--ui-linha); vertical-align: top; }
    th { color: var(--ui-texto-2); font-weight: 600; white-space: nowrap; }
    td { font-variant-numeric: tabular-nums; }
    tr.aberta { background: var(--ui-superficie-2); }
    .bloco { display: block; }
    .baixo { color: #c92a2a; font-weight: 700; }
    .paginacao { display: flex; gap: var(--ui-e3); align-items: center; justify-content: center; margin-top: var(--ui-e4); }
    .vazio { margin-top: var(--ui-e3); }
    .linha { margin-top: var(--ui-e4); display: grid; gap: var(--ui-e2); }
    .linha-topo { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: var(--ui-e2); }
    h2 { font-size: var(--ui-t-lg); }
    .hora { font-size: var(--ui-t-sm); color: var(--ui-texto-2); margin-top: var(--ui-e2); }
    .eventos { list-style: none; margin: 0; padding: 0 0 0 var(--ui-e3); border-left: 2px solid var(--ui-linha); display: grid; gap: 4px; }
    .ev { display: grid; grid-template-columns: 5.5rem 1fr; gap: var(--ui-e2); }
    .ev time { color: var(--ui-texto-2); font-variant-numeric: tabular-nums; }
    .ev.api_request { font-weight: 600; }
    .ev.userpromptsubmit, .ev.stop { color: var(--ui-marca-tinta); }
    .ev.posttoolusefailure { color: #c92a2a; }
    @media (max-width: 720px) {
      table, thead, tbody, tr, td { display: block; }
      thead { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
      tr { border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle); margin-bottom: var(--ui-e3); padding: var(--ui-e2); }
      td { display: flex; justify-content: space-between; gap: var(--ui-e3); border: 0; padding: 2px var(--ui-e2); }
      td[data-rotulo]::before { content: attr(data-rotulo); color: var(--ui-texto-2); font-weight: 600; }
    }
  `,
})
export class HistoricoSessoesPage {
  protected readonly store = inject(HistoricoSessoesStore);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({ projeto: [''], de: [''], ate: [''] });
  protected readonly ehAdmin = computed(() => this.auth.usuario()?.perfil === 'ADMIN');
  protected readonly mostrarUsuario = computed(() => this.store.filtro().escopo === 'TODOS');

  protected readonly status = STATUS;
  protected readonly dataHora = formatarDataHora;
  protected readonly duracao = formatarDuracao;
  protected readonly numero = formatarNumero;
  protected readonly dolar = formatarDolarCompacto;
  protected readonly percentual = formatarPercentual;
  protected readonly descricao = (s: SessaoHistorico) => `${s.projeto} de ${formatarDataHora(s.iniciadaEm)}`;

  constructor() {
    void this.store.carregar();
  }

  protected filtrar(): void {
    void this.store.filtrar(this.form.getRawValue());
  }

  protected limpar(): void {
    this.form.reset({ projeto: '', de: '', ate: '' });
    this.filtrar();
  }

  protected trocar(escopo: 'MEU' | 'TODOS'): void {
    this.form.reset({ projeto: '', de: '', ate: '' });
    void this.store.trocarEscopo(escopo);
  }
}
