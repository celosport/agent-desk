import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { API_BASE_URL } from '../../core/config/api.config';
import { Avisos } from '../../core/ui/avisos.service';
import { formatarDataHora, formatarHaQuanto } from '../../shared/util/formatos';
import { ConexaoClaudeStore, comandosDeInstalacao } from './data-access/conexao-claude';

/**
 * Conectar o Claude Code do computador ao AgentDesk: gera um token (mostrado uma vez) e o comando que instala o coletor
 * (hooks + telemetria no ~/.claude/settings.json, com cópia de segurança). [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
 */
@Component({
  selector: 'app-conexao-claude',
  imports: [ReactiveFormsModule, RouterLink],
  providers: [ConexaoClaudeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-cartao bloco" id="claude-code" aria-labelledby="titulo-claude-code">
      <h2 id="titulo-claude-code">Claude Code</h2>
      <p class="ui-suave">
        Acompanhe as sessões do Claude Code do seu computador no <a routerLink="/escritorio">Escritório</a>: cada projeto vira uma sala e
        cada sessão um robô, com o que está fazendo e os tokens gastos. Usa a sua assinatura (não precisa de API key).
      </p>
      <p class="ui-suave dica">
        Só metadados saem do seu PC: nome da pasta, ferramenta, nome do arquivo, o começo do comando, tokens e custo. Código e texto dos
        prompts não saem.
      </p>

      @if (store.criado(); as c) {
        <div class="segredo" role="region" aria-label="Token criado">
          <p><strong>Token criado para "{{ c.token.nome }}".</strong> Copie o comando agora: o token não aparece de novo.</p>
          <div class="sistemas" role="group" aria-label="Sistema">
            <button type="button" class="ui-botao" [attr.aria-pressed]="sistema() === 'windows'" (click)="sistema.set('windows')">Windows (PowerShell)</button>
            <button type="button" class="ui-botao" [attr.aria-pressed]="sistema() === 'unix'" (click)="sistema.set('unix')">macOS / Linux</button>
          </div>
          <pre class="comando" data-testid="comando-instalacao">{{ comando() }}</pre>
          <div class="acoes">
            <button type="button" class="ui-botao ui-botao--primario" (click)="copiar(comando())">Copiar comando</button>
            <button type="button" class="ui-botao ui-botao--fantasma" (click)="store.esconderSegredo()">Já instalei</button>
          </div>
          <ol class="ui-suave passos">
            <li>Abra o terminal ({{ sistema() === 'windows' ? 'PowerShell' : 'Terminal' }}) no computador onde você usa o Claude Code (precisa do Node 18+).</li>
            <li>Cole o comando e tecle Enter. Ele faz uma cópia do seu <code>~/.claude/settings.json</code> antes de mexer.</li>
            <li>Abra uma sessão nova do Claude Code e veja o robô aparecer no Escritório → Claude Code.</li>
          </ol>
        </div>
      }

      <form class="linha" [formGroup]="form" (ngSubmit)="criar()" novalidate>
        <div class="ui-campo crescer">
          <label for="nome-maquina">Nome do computador</label>
          <input id="nome-maquina" class="ui-entrada" maxlength="80" placeholder="Ex.: Notebook do trabalho" formControlName="nome" />
        </div>
        <button type="submit" class="ui-botao ui-botao--primario" [disabled]="criando()">Gerar token e comando</button>
      </form>
      @if (erro()) {
        <p class="ui-erro" role="alert">{{ erro() }}</p>
      }

      @if (store.tokens().length) {
        <ul class="tokens" aria-label="Computadores conectados">
          @for (t of store.tokens(); track t.tokenId) {
            <li [class.revogado]="t.revogadoEm">
              <span><strong>{{ t.nome }}</strong> <code>{{ t.prefixo }}…</code></span>
              <span class="ui-suave">
                @if (t.revogadoEm) {
                  revogado em {{ dataHora(t.revogadoEm) }}
                } @else if (t.ultimoUsoEm) {
                  último sinal {{ haQuanto(t.ultimoUsoEm) }}
                } @else {
                  ainda sem sinal
                }
              </span>
              @if (!t.revogadoEm) {
                <button type="button" class="ui-botao ui-botao--fantasma" [attr.aria-label]="'Revogar ' + t.nome" (click)="revogar(t.tokenId)">Revogar</button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); margin-bottom: var(--ui-e5); }
    h2 { font-size: var(--ui-t-lg); }
    .dica { font-size: var(--ui-t-xs); }
    .segredo { display: grid; gap: var(--ui-e3); padding: var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-alerta-fundo); }
    .sistemas, .acoes { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
    .sistemas [aria-pressed='true'] { background: var(--ui-marca); color: var(--ui-marca-texto); border-color: var(--ui-marca); }
    .comando { margin: 0; padding: var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-superficie);
      white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--ui-t-xs); }
    .passos { margin: 0; padding-left: var(--ui-e5); font-size: var(--ui-t-sm); display: grid; gap: var(--ui-e1); }
    .linha { display: flex; flex-wrap: wrap; gap: var(--ui-e2); align-items: end; }
    .crescer { flex: 1 1 16rem; }
    .tokens { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); }
    .tokens li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ui-e2);
      padding: var(--ui-e2) var(--ui-e3); border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle); }
    .tokens li.revogado { opacity: 0.6; }
  `,
})
export class ConexaoClaude {
  protected readonly store = inject(ConexaoClaudeStore);
  private readonly avisos = inject(Avisos);
  private readonly urlApi = inject(API_BASE_URL) || location.origin;

  protected readonly form = inject(NonNullableFormBuilder).group({ nome: [''] });
  protected readonly criando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly sistema = signal<'windows' | 'unix'>(navigator.userAgent.includes('Windows') ? 'windows' : 'unix');
  protected readonly comando = computed(() => {
    const c = this.store.criado();
    return c ? comandosDeInstalacao(location.origin, this.urlApi, c.segredo, c.token.nome)[this.sistema()] : '';
  });
  protected readonly dataHora = formatarDataHora;
  protected readonly haQuanto = (iso: string) => formatarHaQuanto(iso);

  constructor() {
    void this.store.carregar();
  }

  protected async criar(): Promise<void> {
    const nome = this.form.controls.nome.value.trim();
    if (!nome) {
      this.erro.set('Dê um nome para reconhecer o computador (ex.: Notebook do trabalho).');
      return;
    }
    this.criando.set(true);
    const erro = await this.store.criar(nome);
    this.criando.set(false);
    this.erro.set(erro);
    if (!erro) this.form.reset();
  }

  protected async revogar(tokenId: string): Promise<void> {
    const erro = await this.store.revogar(tokenId);
    this.avisos.mostrar(erro ?? 'Token revogado: esse computador para de enviar na hora.', erro ? 'erro' : 'sucesso');
  }

  protected async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.avisos.mostrar('Comando copiado.', 'sucesso');
    } catch {
      this.avisos.mostrar('Não foi possível copiar. Selecione o texto e copie manualmente.', 'erro');
    }
  }
}
