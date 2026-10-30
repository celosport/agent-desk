import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { Avisos } from '../../core/ui/avisos.service';
import { TAMANHO_MAXIMO_ENTRADA, baixarTexto, nomeArquivoResultado, tamanhoEmBytes, validarArquivoEntrada } from '../../shared/util/arquivos';
import { formatarDolar, formatarNumero } from '../../shared/util/formatos';
import { AutomacoesStore } from './data-access/automacoes.store';
import { EditarAutomacao } from './editar-automacao.component';

/**
 * Automações em 1 clique: escolhe o fluxo, cola um texto (ou envia .txt/.md), roda e copia/baixa o resultado.
 * A chamada à Claude é feita pela API com a chave do usuário — o navegador nunca vê a chave. [[Módulo Automacoes]]
 */
@Component({
  selector: 'app-automacoes',
  imports: [ReactiveFormsModule, RouterLink, EditarAutomacao],
  providers: [AutomacoesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina">
      <h1 class="ui-titulo-pagina">Automações</h1>

      @if (store.carregando() && !store.automacoes().length) {
        <p class="ui-suave">Carregando…</p>
      } @else if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
        <button type="button" class="ui-botao" (click)="store.carregar()">Tentar de novo</button>
      } @else {
        <ul class="fluxos" aria-label="Automações">
          @for (a of store.automacoes(); track a.automacaoId) {
            <li>
              <button type="button" class="ui-cartao fluxo" [class.selecionado]="a.automacaoId === store.selecionadaId()"
                      [attr.aria-pressed]="a.automacaoId === store.selecionadaId()" [disabled]="!!store.executando()"
                      (click)="selecionar(a.automacaoId)">
                <strong>{{ a.nome }}</strong>
                <span class="ui-suave">{{ a.descricao }}</span>
                <small class="ui-suave">{{ store.nomeDoModelo(a.modeloId) }}{{ a.ativa ? '' : ' · inativa' }}</small>
              </button>
            </li>
          }
        </ul>

        @if (store.selecionada(); as automacao) {
          <section class="ui-cartao painel" aria-labelledby="titulo-execucao">
            <div class="cabecalho">
              <h2 id="titulo-execucao">{{ automacao.nome }}</h2>
              @if (ehAdmin()) {
                <button type="button" class="ui-botao ui-botao--fantasma" (click)="editando.set(!editando())">
                  {{ editando() ? 'Fechar edição' : 'Editar fluxo' }}
                </button>
              }
            </div>

            @if (editando()) {
              <app-editar-automacao [automacao]="automacao" (salva)="editando.set(false)" />
            }

            <form class="grade" [formGroup]="form" (ngSubmit)="executar()" novalidate>
              <div class="ui-campo">
                <label for="entrada">Texto de entrada</label>
                <textarea id="entrada" class="ui-entrada texto" rows="10" formControlName="entrada"
                          placeholder="Cole aqui o texto, o código ou o documento…"></textarea>
                <p class="ui-suave dica" [class.excedido]="excedido()">{{ tamanho() }} de 200 KB</p>
              </div>

              <div class="linha">
                <div class="ui-campo crescer">
                  <label for="arquivo">Ou envie um arquivo (.txt ou .md)</label>
                  <input id="arquivo" class="ui-entrada" type="file" accept=".txt,.md,text/plain,text/markdown"
                         (change)="aoEscolherArquivo($event)" />
                  @if (nomeArquivo()) {
                    <p class="ui-suave dica">O texto acima veio de <strong>{{ nomeArquivo() }}</strong>.</p>
                  }
                </div>
                <div class="ui-campo crescer">
                  <label for="modelo">Modelo</label>
                  <select id="modelo" class="ui-entrada" formControlName="modeloId">
                    <option value="">Padrão da automação ({{ store.nomeDoModelo(automacao.modeloId) }})</option>
                    @for (m of store.modelosAtivos(); track m.modeloId) {
                      <option [value]="m.modeloId">{{ m.nomeExibicao }} ({{ dolar(m.precoEntradaMTok) }} / {{ dolar(m.precoSaidaMTok) }})</option>
                    }
                  </select>
                </div>
              </div>

              <div>
                <button type="submit" class="ui-botao ui-botao--primario" [disabled]="!!store.executando()">
                  {{ store.executando() ? 'Executando…' : 'Executar' }}
                </button>
              </div>
            </form>

            @if (erroForm()) {
              <p class="ui-erro" role="alert">{{ erroForm() }}</p>
            }
            @if (store.executando()) {
              <p class="ui-suave" role="status">A Claude está trabalhando no pedido. Isso pode levar até 2 minutos.</p>
            }
            @if (store.falha(); as f) {
              <div class="ui-erro falha" role="alert">
                <p>{{ f.mensagem }}</p>
                @if (f.irParaConfiguracoes) {
                  <a routerLink="/configuracoes">Ir para Configurações</a>
                }
              </div>
            }
          </section>

          @if (store.execucao(); as e) {
            <section class="ui-cartao painel" aria-labelledby="titulo-resultado">
              <div class="cabecalho">
                <h2 id="titulo-resultado">Resultado</h2>
                <div class="acoes">
                  <button type="button" class="ui-botao" (click)="copiar(e.resultado)">Copiar</button>
                  <button type="button" class="ui-botao" (click)="baixar(e.codigo, e.resultado)">Baixar .md</button>
                </div>
              </div>

              @if (e.alertaLimite; as alerta) {
                <p class="alerta" role="status">
                  {{ alerta.atingido ? 'Limite do mês atingido' : 'Atenção ao limite do mês' }}: você já usou
                  {{ dolar(alerta.gastoMesUsd) }} de {{ dolar(alerta.limiteMensalUsd) }} ({{ alerta.percentual }}%).
                </p>
              }
              @if (e.truncado) {
                <p class="alerta" role="status">A resposta foi cortada no máximo de tokens desta automação.</p>
              }

              <dl class="metricas" aria-label="Consumo desta execução">
                <div><dt>Tokens de entrada</dt><dd>{{ numero(e.tokens.entrada) }}</dd></div>
                <div><dt>Tokens de saída</dt><dd>{{ numero(e.tokens.saida) }}</dd></div>
                <div><dt>Total de tokens</dt><dd>{{ numero(e.tokens.total) }}</dd></div>
                <div><dt>Custo</dt><dd>{{ dolar(e.custoUsd, 6) }}</dd></div>
                <div><dt>Duração</dt><dd>{{ segundos(e.duracaoMs) }}</dd></div>
                <div><dt>Modelo</dt><dd>{{ store.nomeDoModelo(e.modeloUsado) }}</dd></div>
              </dl>

              <pre class="resultado" data-testid="resultado">{{ e.resultado }}</pre>
            </section>
          }
        }
      }
    </main>
  `,
  styles: `
    .fluxos { list-style: none; margin: 0 0 var(--ui-e5); padding: 0; display: grid; gap: var(--ui-e3);
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); }
    .fluxo { width: 100%; height: 100%; display: grid; gap: var(--ui-e1); text-align: left; cursor: pointer; font: inherit; color: inherit; }
    .fluxo.selecionado { border-color: var(--ui-marca); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-marca) 30%, transparent); }
    .fluxo:disabled { cursor: progress; }
    .painel { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); margin-bottom: var(--ui-e5); }
    .cabecalho { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ui-e2); }
    h2 { font-size: var(--ui-t-lg); }
    .grade { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e4); }
    .texto { min-height: 12rem; padding: var(--ui-e3); resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .linha { display: flex; flex-wrap: wrap; gap: var(--ui-e3); }
    .crescer { flex: 1 1 16rem; min-width: 0; }
    .dica { font-size: var(--ui-t-xs); }
    .excedido { color: var(--ui-vermelho); font-weight: 600; }
    .falha { display: grid; gap: var(--ui-e1); }
    .acoes { display: flex; gap: var(--ui-e2); }
    .alerta { padding: var(--ui-e2) var(--ui-e3); border-radius: var(--ui-raio-controle);
      background: color-mix(in srgb, #f59f00 18%, var(--ui-superficie)); font-weight: 600; }
    .metricas { display: grid; gap: var(--ui-e2); grid-template-columns: repeat(auto-fill, minmax(min(100%, 9rem), 1fr)); margin: 0; }
    .metricas div { padding: var(--ui-e2); border-radius: var(--ui-raio-controle); background: var(--ui-superficie-2); }
    .metricas dt { font-size: var(--ui-t-xs); color: var(--ui-texto-2); }
    .metricas dd { margin: 0; font-weight: 700; }
    .resultado { margin: 0; padding: var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-superficie-2);
      white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--ui-t-sm); max-height: 60vh; overflow: auto; }
  `,
})
export class AutomacoesPage {
  protected readonly store = inject(AutomacoesStore);
  private readonly auth = inject(AuthStore);
  private readonly avisos = inject(Avisos);

  protected readonly ehAdmin = computed(() => this.auth.usuario()?.perfil === 'ADMIN');
  protected readonly form = inject(NonNullableFormBuilder).group({ entrada: [''], modeloId: [''] });
  protected readonly nomeArquivo = signal<string | null>(null);
  protected readonly erroForm = signal<string | null>(null);
  protected readonly editando = signal(false);

  private readonly bytes = signal(0);
  protected readonly tamanho = computed(() =>
    this.bytes() < 1024 ? `${this.bytes()} bytes` : `${(this.bytes() / 1024).toFixed(1).replace('.', ',')} KB`,
  );
  protected readonly excedido = computed(() => this.bytes() > TAMANHO_MAXIMO_ENTRADA);

  protected readonly dolar = (v: number, casas?: number) => formatarDolar(v, casas);
  protected readonly numero = formatarNumero;
  protected readonly segundos = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

  constructor() {
    void this.store.carregar();
    this.form.controls.entrada.valueChanges.subscribe((t) => this.bytes.set(tamanhoEmBytes(t)));
  }

  protected selecionar(automacaoId: string): void {
    this.store.selecionar(automacaoId);
    this.form.controls.modeloId.setValue('');
    this.erroForm.set(null);
    this.editando.set(false);
  }

  protected async aoEscolherArquivo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    const erro = validarArquivoEntrada(arquivo);
    this.erroForm.set(erro);
    if (erro) {
      input.value = '';
      return;
    }
    this.form.controls.entrada.setValue(await arquivo.text());
    this.nomeArquivo.set(arquivo.name);
  }

  protected async executar(): Promise<void> {
    const { entrada, modeloId } = this.form.getRawValue();
    if (!entrada.trim()) {
      this.erroForm.set('Cole um texto ou envie um arquivo .txt/.md.');
      return;
    }
    if (this.excedido()) {
      this.erroForm.set('A entrada tem no máximo 200 KB.');
      return;
    }
    this.erroForm.set(null);
    const execucao = await this.store.executar({ entrada, modeloId: modeloId || null, nomeArquivo: this.nomeArquivo() });
    if (execucao) this.avisos.mostrar('Automação concluída.', 'sucesso');
  }

  protected async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.avisos.mostrar('Resultado copiado.', 'sucesso');
    } catch {
      this.avisos.mostrar('Não foi possível copiar. Selecione o texto e copie manualmente.', 'erro');
    }
  }

  protected baixar(codigo: string, texto: string): void {
    baixarTexto(nomeArquivoResultado(codigo, new Date()), texto);
  }
}
