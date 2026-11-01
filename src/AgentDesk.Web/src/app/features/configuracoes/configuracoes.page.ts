import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/auth/auth.store';
import { Avisos } from '../../core/ui/avisos.service';
import { formatarDolarFixo } from '../../shared/util/formatos';
import { ConfiguracoesStore, ResultadoTeste } from './data-access/configuracoes.store';
import { AlertasCelular } from './alertas-celular.component';
import { ConexaoClaude } from './conexao-claude.component';
import { ModelosPrecos, numero } from './modelos-precos.component';

/**
 * Configurações do usuário: API key da Anthropic (só a máscara aparece depois de salva), modelo padrão e limite de gasto.
 * O ADMIN vê também a tabela de modelos e preços. [[Módulo Configuracoes]]
 */
@Component({
  selector: 'app-configuracoes',
  imports: [ReactiveFormsModule, ConexaoClaude, AlertasCelular, ModelosPrecos],
  providers: [ConfiguracoesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina larga">
      <h1 class="ui-titulo-pagina">Configurações</h1>

      @if (store.carregando() && !store.configuracao()) {
        <p class="ui-suave">Carregando…</p>
      } @else if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
        <button type="button" class="ui-botao" (click)="store.carregar()">Tentar de novo</button>
      } @else if (store.configuracao(); as config) {
        <div class="topo-grade">
        <section class="ui-cartao bloco" aria-labelledby="titulo-chave">
          <h2 id="titulo-chave">Chave da API da Anthropic</h2>
          <p class="ui-suave">
            A chave fica guardada só no servidor, criptografada. Depois de salva, ela não volta para o navegador.
          </p>

          @if (config.chaveApiConfigurada) {
            <p class="chave-salva">
              Chave salva: <code data-testid="chave-mascarada">{{ config.chaveApiMascarada }}</code>
            </p>
            <div class="acoes">
              <button type="button" class="ui-botao" [disabled]="testando()" (click)="testar()">
                {{ testando() ? 'Testando…' : 'Testar chave' }}
              </button>
              <button type="button" class="ui-botao ui-botao--fantasma" (click)="removerChave()">Remover chave</button>
            </div>
            @if (resultadoTeste(); as r) {
              <p [class]="r.tipo === 'valida' ? 'teste ok' : 'teste falha'" role="status">{{ r.mensagem }}</p>
            }
          } @else {
            <p class="ui-suave">Nenhuma chave salva. Crie uma no Console da Anthropic (console.anthropic.com) e cole abaixo.</p>
          }

          <form class="linha" [formGroup]="formChave" (ngSubmit)="salvarChave()" novalidate>
            <div class="ui-campo crescer">
              <label for="chave-api">{{ config.chaveApiConfigurada ? 'Trocar a API key' : 'API key' }}</label>
              <input id="chave-api" class="ui-entrada" type="password" autocomplete="off" spellcheck="false"
                     placeholder="sk-ant-..." formControlName="chaveApi" />
            </div>
            <button type="submit" class="ui-botao ui-botao--primario" [disabled]="salvandoChave()">Salvar chave</button>
          </form>
          @if (erroChave()) {
            <p class="ui-erro" role="alert">{{ erroChave() }}</p>
          }
        </section>

        <section class="ui-cartao bloco" aria-labelledby="titulo-preferencias">
          <h2 id="titulo-preferencias">Modelo e limite de gasto</h2>
          <form class="grade" [formGroup]="formPreferencias" (ngSubmit)="salvarPreferencias()" novalidate>
            <div class="ui-campo">
              <label for="modelo-padrao">Modelo padrão</label>
              <select id="modelo-padrao" class="ui-entrada" formControlName="modeloPadraoId">
                <option value="">Escolha um modelo</option>
                @for (m of store.modelosAtivos(); track m.modeloId) {
                  <option [value]="m.modeloId">
                    {{ m.nomeExibicao }} ({{ dolar(m.precoEntradaMTok) }} / {{ dolar(m.precoSaidaMTok) }})
                  </option>
                }
              </select>
              <p class="ui-suave dica">Preço em US$ por milhão de tokens (entrada / saída).</p>
              @if (store.modeloPadraoInativo()) {
                <p class="ui-erro">O modelo que você usava foi desativado. Escolha outro.</p>
              }
            </div>

            <div class="ui-campo">
              <label for="limite-mensal">Limite de gasto por mês (US$)</label>
              <input id="limite-mensal" class="ui-entrada" type="number" inputmode="decimal" min="0.01" step="0.01"
                     placeholder="Sem limite" formControlName="limiteMensalUsd" />
              <p class="ui-suave dica">Aviso ao chegar em 80% do limite. Em branco = sem limite.</p>
            </div>

            <label class="opcao">
              <input type="checkbox" formControlName="bloquearAoAtingirLimite" />
              Bloquear novas automações ao atingir o limite (desmarcado = só avisar)
            </label>

            <div>
              <button type="submit" class="ui-botao ui-botao--primario" [disabled]="salvandoPreferencias()">Salvar preferências</button>
            </div>
          </form>
          @if (erroPreferencias()) {
            <p class="ui-erro" role="alert">{{ erroPreferencias() }}</p>
          }
        </section>
        </div>

        <app-conexao-claude />

        <app-alertas-celular />

        @if (ehAdmin()) {
          <app-modelos-precos />
        }
      }
    </main>
  `,
  styles: `
    .larga { max-width: min(76rem, 100%); }
    /* Chave da API e preferências lado a lado (uma coluna no celular); o resto ocupa a largura toda */
    .topo-grade { display: grid; gap: var(--ui-e4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr)); align-items: start; margin-bottom: var(--ui-e5); }
    .topo-grade .bloco { margin-bottom: 0; }
    .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); margin-bottom: var(--ui-e5); }
    h2 { font-size: var(--ui-t-lg); }
    .chave-salva code { font-weight: 600; }
    .acoes, .linha { display: flex; flex-wrap: wrap; gap: var(--ui-e2); align-items: end; }
    .crescer { flex: 1 1 18rem; }
    .grade { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e4); }
    .opcao { display: flex; gap: var(--ui-e2); align-items: flex-start; }
    .dica { font-size: var(--ui-t-xs); }
    .teste { font-weight: 600; }
    .teste.ok { color: var(--ui-verde); }
    .teste.falha { color: var(--ui-vermelho); }
  `,
})
export class ConfiguracoesPage {
  protected readonly store = inject(ConfiguracoesStore);
  private readonly auth = inject(AuthStore);
  private readonly avisos = inject(Avisos);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly ehAdmin = computed(() => this.auth.usuario()?.perfil === 'ADMIN');
  protected readonly dolar = (v: number) => formatarDolarFixo(v);

  protected readonly formChave = this.fb.group({ chaveApi: ['', Validators.required] });
  protected readonly formPreferencias = this.fb.group({
    modeloPadraoId: [''],
    limiteMensalUsd: this.fb.control<number | null>(null),
    bloquearAoAtingirLimite: [true],
  });

  protected readonly salvandoChave = signal(false);
  protected readonly salvandoPreferencias = signal(false);
  protected readonly testando = signal(false);
  protected readonly erroChave = signal<string | null>(null);
  protected readonly erroPreferencias = signal<string | null>(null);
  protected readonly resultadoTeste = signal<ResultadoTeste | null>(null);

  constructor() {
    void this.store.carregar();
    // O formulário de preferências espelha o que está salvo na API
    effect(() => {
      const c = this.store.configuracao();
      if (!c) return;
      this.formPreferencias.reset({
        modeloPadraoId: c.modeloPadraoId ?? '',
        limiteMensalUsd: c.limiteMensalUsd ?? null,
        bloquearAoAtingirLimite: c.bloquearAoAtingirLimite,
      });
    });
  }

  protected async salvarChave(): Promise<void> {
    const chave = this.formChave.controls.chaveApi.value.trim();
    if (!chave) {
      this.erroChave.set('Cole a sua API key da Anthropic.');
      return;
    }
    this.salvandoChave.set(true);
    this.resultadoTeste.set(null); // antes do await: um "Testar" clicado enquanto salva não pode ter o resultado apagado depois
    const erro = await this.store.salvarChave(chave);
    this.salvandoChave.set(false);
    this.erroChave.set(erro);
    if (!erro) {
      this.formChave.reset(); // a chave digitada não fica na tela
      this.avisos.mostrar('Chave salva.', 'sucesso');
    }
  }

  protected async removerChave(): Promise<void> {
    const erro = await this.store.removerChave();
    this.resultadoTeste.set(null);
    this.avisos.mostrar(erro ?? 'Chave removida.', erro ? 'erro' : 'sucesso');
  }

  protected async testar(): Promise<void> {
    this.testando.set(true);
    this.resultadoTeste.set(null);
    this.resultadoTeste.set(await this.store.testarChave());
    this.testando.set(false);
  }

  protected async salvarPreferencias(): Promise<void> {
    const v = this.formPreferencias.getRawValue();
    this.salvandoPreferencias.set(true);
    const erro = await this.store.salvarPreferencias({
      modeloPadraoId: v.modeloPadraoId || null,
      limiteMensalUsd: numero(v.limiteMensalUsd), // vazio = sem limite; "0" ou negativo a API recusa com a mensagem do campo
      bloquearAoAtingirLimite: v.bloquearAoAtingirLimite,
    });
    this.salvandoPreferencias.set(false);
    this.erroPreferencias.set(erro);
    if (!erro) this.avisos.mostrar('Preferências salvas.', 'sucesso');
  }
}
