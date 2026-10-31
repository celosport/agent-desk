import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { Avisos } from '../../core/ui/avisos.service';
import { baixarTexto, nomeArquivoResultado } from '../../shared/util/arquivos';
import { formatarDataHora, formatarDolar, formatarDolarCompacto, formatarHora, formatarNumero } from '../../shared/util/formatos';
import { Chamada, EscopoConsumo, StatusChamada } from './data-access/consumo.models';
import { HistoricoStore } from './data-access/historico.store';

const STATUS: Record<StatusChamada, string> = { SUCESSO: '✓ Sucesso', ERRO: '✕ Erro', RECUSADA: '⊘ Recusada', CANCELADA: '■ Cancelada' };

/** Histórico de chamadas com filtros (período, automação, modelo, status), paginação e o resultado de cada uma. [[Módulo Consumo]] */
@Component({
  selector: 'app-historico-consumo',
  imports: [ReactiveFormsModule, RouterLink],
  providers: [HistoricoStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina larga">
      <div class="cabecalho">
        <h1 class="ui-titulo-pagina">Histórico de consumo</h1>
        <a class="ui-botao ui-botao--fantasma" routerLink="/consumo">Voltar ao painel</a>
      </div>

      <form class="ui-cartao filtros" [formGroup]="form" (ngSubmit)="aplicar()" novalidate aria-label="Filtros do histórico">
        @if (ehAdmin()) {
          <div class="ui-campo"><label for="f-escopo">De quem</label>
            <select id="f-escopo" class="ui-entrada" formControlName="escopo">
              <option value="MEU">Meu consumo</option>
              <option value="TODOS">Todos os usuários</option>
            </select></div>
        }
        <div class="ui-campo"><label for="f-de">De</label><input id="f-de" class="ui-entrada" type="date" formControlName="de" /></div>
        <div class="ui-campo"><label for="f-ate">Até</label><input id="f-ate" class="ui-entrada" type="date" formControlName="ate" /></div>
        <div class="ui-campo"><label for="f-automacao">Automação</label>
          <select id="f-automacao" class="ui-entrada" formControlName="automacaoId">
            <option value="">Todas</option>
            @for (a of store.opcoes().automacoes; track a.automacaoId) {
              <option [value]="a.automacaoId">{{ a.nome }}</option>
            }
          </select></div>
        <div class="ui-campo"><label for="f-modelo">Modelo</label>
          <select id="f-modelo" class="ui-entrada" formControlName="modeloId">
            <option value="">Todos</option>
            @for (m of store.opcoes().modelos; track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select></div>
        <div class="ui-campo"><label for="f-status">Status</label>
          <select id="f-status" class="ui-entrada" formControlName="status">
            <option value="">Todos</option>
            <option value="SUCESSO">Sucesso</option>
            <option value="ERRO">Erro</option>
            <option value="RECUSADA">Recusada</option>
            <option value="CANCELADA">Cancelada</option>
          </select></div>
        <div class="acoes">
          <button type="submit" class="ui-botao ui-botao--primario">Filtrar</button>
          <button type="button" class="ui-botao ui-botao--fantasma" (click)="limpar()">Limpar</button>
        </div>
      </form>

      @if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
      }

      @if (store.pagina(); as p) {
        <p class="resumo" role="status">
          {{ p.total }} chamada{{ p.total === 1 ? '' : 's' }} · {{ numero(p.totais.tokens) }} tokens · {{ compacto(p.totais.custoUsd) }}
        </p>

        @if (p.itens.length) {
          <div class="ui-cartao tabela">
            <table role="table" aria-label="Chamadas">
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">Data</th>
                  @if (mostrarUsuario()) { <th role="columnheader" scope="col">Usuário</th> }
                  <th role="columnheader" scope="col">Automação</th>
                  <th role="columnheader" scope="col">Modelo</th>
                  <th role="columnheader" scope="col">Tokens</th>
                  <th role="columnheader" scope="col">Custo</th>
                  <th role="columnheader" scope="col">Duração</th>
                  <th role="columnheader" scope="col">Status</th>
                  <th role="columnheader" scope="col"><span class="ui-visualmente-oculto">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                @for (c of p.itens; track c.chamadaId) {
                  <tr role="row" [class.aberta]="store.detalhe()?.chamada?.chamadaId === c.chamadaId">
                    <td role="cell" data-rotulo="Data">{{ dataHora(c.iniciadaEm) }}</td>
                    @if (mostrarUsuario()) { <td role="cell" data-rotulo="Usuário">{{ c.usuarioNome ?? '—' }}</td> }
                    <td role="cell" data-rotulo="Automação">{{ c.automacaoNome ?? '—' }}</td>
                    <td role="cell" data-rotulo="Modelo" class="modelo">{{ c.modeloUsado ?? c.modeloId }}{{ c.modeloUsado && c.modeloUsado !== c.modeloId ? ' (fallback)' : '' }}</td>
                    <td role="cell" data-rotulo="Tokens">
                      <span>{{ numero(c.tokens.total) }}<small class="ui-suave detalhe-tokens">entrada {{ numero(c.tokens.entrada) }} · saída {{ numero(c.tokens.saida) }}</small></span>
                    </td>
                    <td role="cell" data-rotulo="Custo">{{ dolar(c.custoUsd) }}</td>
                    <td role="cell" data-rotulo="Duração">{{ segundos(c.duracaoMs) }}<small class="ui-suave detalhe-tokens">{{ intervalo(c) }}</small></td>
                    <td role="cell" data-rotulo="Status">
                      <span [class]="'status ' + c.status.toLowerCase()">{{ status[c.status] }}</span>
                      @if (c.erroCodigo) { <small class="ui-suave"> {{ c.erroCodigo }}</small> }
                    </td>
                    <td role="cell">
                      @if (c.temResultado) {
                        <button type="button" class="ui-botao" [attr.aria-label]="'Ver resultado de ' + descricao(c)" (click)="store.abrir(c.chamadaId)">
                          Ver resultado
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <nav class="paginas" aria-label="Páginas do histórico">
            <button type="button" class="ui-botao" [disabled]="p.pagina <= 1" (click)="store.irPara(p.pagina - 1)">Anterior</button>
            <span>Página {{ p.pagina }} de {{ store.totalPaginas() }}</span>
            <button type="button" class="ui-botao" [disabled]="p.pagina >= store.totalPaginas()" (click)="store.irPara(p.pagina + 1)">Próxima</button>
          </nav>
        } @else {
          <section class="ui-cartao vazio">
            <p>Nenhuma chamada com esses filtros.</p>
          </section>
        }
      } @else if (store.carregando()) {
        <p class="ui-suave">Carregando…</p>
      }

      @if (store.erroDetalhe()) {
        <p class="ui-erro" role="alert">{{ store.erroDetalhe() }}</p>
      }
      @if (store.detalhe(); as d) {
        <section class="ui-cartao detalhe" aria-labelledby="titulo-detalhe">
          <div class="cabecalho">
            <h2 id="titulo-detalhe">Resultado — {{ d.chamada.automacaoNome ?? 'chamada' }} · {{ dataHora(d.chamada.iniciadaEm) }}</h2>
            <div class="acoes">
              <button type="button" class="ui-botao" (click)="copiar(d.resultado ?? '')">Copiar</button>
              <button type="button" class="ui-botao" (click)="baixar(d.chamada, d.resultado ?? '')">Baixar .md</button>
              <button type="button" class="ui-botao ui-botao--fantasma" (click)="store.fechar()">Fechar</button>
            </div>
          </div>
          @if (d.precoEntradaMTok !== undefined) {
            <p class="ui-suave">
              Preço usado (US$ por milhão de tokens): entrada {{ dolar(d.precoEntradaMTok) }} · saída {{ dolar(d.precoSaidaMTok ?? 0) }}
            </p>
          }
          <pre class="resultado" data-testid="resultado-historico">{{ d.resultado }}</pre>
        </section>
      }
    </main>
  `,
  styles: `
    .cabecalho { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ui-e2); }
    .filtros { display: grid; gap: var(--ui-e3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); align-items: end;
      margin-bottom: var(--ui-e4); }
    .acoes { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
    .resumo { font-weight: 600; margin-bottom: var(--ui-e3); }
    .larga { max-width: min(76rem, 100%); }
    .tabela { padding: 0; overflow-x: auto; }
    .modelo, .status, td:last-child .ui-botao { white-space: nowrap; }
    .detalhe-tokens { display: block; font-size: var(--ui-t-xs); white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; font-size: var(--ui-t-sm); font-variant-numeric: tabular-nums; }
    th, td { padding: var(--ui-e2) var(--ui-e3); border-bottom: 1px solid var(--ui-linha); text-align: left; vertical-align: middle; }
    th { color: var(--ui-texto-2); font-weight: 600; }
    tr.aberta { background: var(--ui-superficie-2); }
    .status { font-weight: 600; white-space: nowrap; }
    .status.sucesso { color: var(--ui-verde); }
    .status.erro, .status.recusada { color: var(--ui-vermelho); }
    .status.cancelada { color: var(--ui-texto-2); }
    .paginas { display: flex; justify-content: center; align-items: center; gap: var(--ui-e3); margin: var(--ui-e4) 0; }
    .vazio { margin-bottom: var(--ui-e4); }
    .detalhe { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); margin-top: var(--ui-e4); }
    h2 { font-size: var(--ui-t-lg); }
    .resultado { margin: 0; padding: var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-superficie-2);
      white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--ui-t-sm); max-height: 60vh; overflow: auto; }
    /* Celular: cada chamada vira um cartão (uma tabela larga alargava a página no Chrome mobile — ver §10 de Arquitetura e Padrões) */
    @media (max-width: 760px) {
      table, tbody, tr, td { display: block; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      tr { padding: var(--ui-e3); border-bottom: 1px solid var(--ui-linha); }
      td { display: flex; justify-content: space-between; gap: var(--ui-e3); padding: 2px 0; border: 0; text-align: right; }
      td[data-rotulo]::before { content: attr(data-rotulo); color: var(--ui-texto-2); text-align: left; }
      td:last-child { justify-content: flex-end; padding-top: var(--ui-e2); }
      .modelo { white-space: normal; }
      .detalhe-tokens { white-space: normal; }
    }
  `,
})
export class HistoricoPage {
  protected readonly store = inject(HistoricoStore);
  private readonly auth = inject(AuthStore);
  private readonly avisos = inject(Avisos);

  protected readonly ehAdmin = computed(() => this.auth.usuario()?.perfil === 'ADMIN');
  protected readonly mostrarUsuario = computed(() => this.store.filtro().escopo === 'TODOS');
  protected readonly status = STATUS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    escopo: ['MEU' as EscopoConsumo],
    de: [''],
    ate: [''],
    automacaoId: [''],
    modeloId: [''],
    status: ['' as StatusChamada | ''],
  });

  protected readonly dolar = (v: number) => formatarDolar(v, 6);
  protected readonly compacto = formatarDolarCompacto;
  protected readonly numero = formatarNumero;
  protected readonly dataHora = formatarDataHora;
  protected readonly segundos = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  protected readonly intervalo = (c: Chamada) => `${formatarHora(c.iniciadaEm)} → ${formatarHora(c.finalizadaEm)}`;
  protected readonly descricao = (c: Chamada) => `${c.automacaoNome ?? 'chamada'} de ${formatarDataHora(c.iniciadaEm)}`;

  constructor() {
    void this.store.carregar();
  }

  protected aplicar(): void {
    void this.store.filtrar(this.form.getRawValue());
  }

  protected limpar(): void {
    const escopo = this.form.controls.escopo.value;
    this.form.reset({ escopo, de: '', ate: '', automacaoId: '', modeloId: '', status: '' });
    void this.store.limpar(escopo);
  }

  protected async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.avisos.mostrar('Resultado copiado.', 'sucesso');
    } catch {
      this.avisos.mostrar('Não foi possível copiar. Selecione o texto e copie manualmente.', 'erro');
    }
  }

  protected baixar(c: Chamada, texto: string): void {
    const codigo = (c.automacaoNome ?? 'chamada').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    baixarTexto(nomeArquivoResultado(codigo, new Date(c.iniciadaEm)), texto);
  }
}
