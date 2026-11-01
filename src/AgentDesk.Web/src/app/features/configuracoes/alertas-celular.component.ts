import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Avisos } from '../../core/ui/avisos.service';
import { PreferenciasAlerta } from './data-access/alertas.models';
import { AlertasStore } from './data-access/alertas.store';

/**
 * Alertas no celular: o app instalado (PWA) avisa quando uma automação ou uma sessão do Claude Code termina, ou quando o Claude Code
 * pede permissão — e diz o que ainda está rodando. [[Módulo Notificacoes]] · [[ADR-016 - Alertas no Celular (Push do App)]]
 */
@Component({
  selector: 'app-alertas-celular',
  providers: [AlertasStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-cartao bloco" id="alertas" aria-labelledby="titulo-alertas">
      <h2 id="titulo-alertas">Alertas no celular</h2>
      <p class="ui-suave">
        Receba um aviso quando uma tarefa terminar, com o resumo do que ainda está rodando. Funciona com o AgentDesk instalado no
        celular, mesmo com o app fechado.
      </p>

      @if (store.carregando() && !store.dados()) {
        <p class="ui-suave">Carregando…</p>
      } @else if (store.dados(); as dados) {
        @switch (store.estado()) {
          @case ('instalar-no-ios') {
            <p class="aviso" role="note">
              No iPhone e no iPad os alertas só funcionam com o AgentDesk instalado: abra este endereço no Safari, toque em
              <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>, abra o app por lá e volte a esta tela.
            </p>
          }
          @case ('indisponivel') {
            <p class="aviso" role="note">Este navegador não permite alertas. Tente no Chrome, Edge, Firefox ou no app instalado do celular.</p>
          }
          @case ('bloqueado') {
            <p class="aviso" role="note">
              Os alertas estão bloqueados neste aparelho. Libere as notificações do AgentDesk nas configurações do navegador (ou do app) e
              volte aqui.
            </p>
          }
          @default {
            @if (store.ativoNesteAparelho()) {
              <p class="ativo" role="status">✅ Alertas ativos neste aparelho.</p>
              <div class="acoes">
                <button type="button" class="ui-botao" [disabled]="store.ocupado()" (click)="testar()">Enviar alerta de teste</button>
                <button type="button" class="ui-botao ui-botao--fantasma" [disabled]="store.ocupado()" (click)="desativar()">
                  Desativar neste aparelho
                </button>
              </div>
            } @else {
              <div class="acoes">
                <button type="button" class="ui-botao ui-botao--primario" [disabled]="store.ocupado()" (click)="ativar()">
                  Ativar alertas neste aparelho
                </button>
              </div>
            }
          }
        }

        @if (store.outrosAparelhos().length > 0) {
          <p class="ui-suave" data-testid="outros-aparelhos">
            Também recebem alertas: {{ nomesDosOutros() }}.
          </p>
        }

        @if (dados.dispositivos.length > 0) {
          <fieldset class="tipos">
            <legend>Avisar quando</legend>
            <label class="opcao">
              <input type="checkbox" [checked]="dados.preferencias.automacoes" (change)="mudar('automacoes', $event)" />
              Uma automação terminar ou falhar
            </label>
            <label class="opcao">
              <input type="checkbox" [checked]="dados.preferencias.sessoes" (change)="mudar('sessoes', $event)" />
              Uma sessão do Claude Code terminar
            </label>
            <label class="opcao">
              <input type="checkbox" [checked]="dados.preferencias.permissoes" (change)="mudar('permissoes', $event)" />
              O Claude Code pedir permissão ou resposta
            </label>
          </fieldset>
        }
      }

      @if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
        @if (!store.dados()) {
          <button type="button" class="ui-botao" (click)="store.carregar()">Tentar de novo</button>
        }
      }
    </section>
  `,
  styles: `
    .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); margin-bottom: var(--ui-e5); }
    h2 { font-size: var(--ui-t-lg); }
    .acoes { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
    .aviso { margin: 0; padding: var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-alerta-fundo); font-size: var(--ui-t-sm); }
    .ativo { margin: 0; font-weight: 600; }
    .tipos { display: grid; gap: var(--ui-e2); border: 0; padding: 0; margin: 0; }
    .tipos legend { font-weight: 600; margin-bottom: var(--ui-e2); padding: 0; }
    .opcao { display: flex; gap: var(--ui-e2); align-items: center; }
  `,
})
export class AlertasCelular implements OnInit {
  protected readonly store = inject(AlertasStore);
  private readonly avisos = inject(Avisos);

  ngOnInit(): void {
    void this.store.carregar();
  }

  protected nomesDosOutros(): string {
    return this.store.outrosAparelhos().map((d) => d.nome).join(', ');
  }

  protected async ativar(): Promise<void> {
    if (await this.store.ativar()) this.avisos.mostrar('Alertas ativados neste aparelho.', 'sucesso');
  }

  protected async desativar(): Promise<void> {
    if (await this.store.desativar()) this.avisos.mostrar('Alertas desativados neste aparelho.', 'info');
  }

  protected async testar(): Promise<void> {
    const entregues = await this.store.testar();
    if (entregues !== null) this.avisos.mostrar('Alerta de teste enviado. Ele deve aparecer em instantes.', 'sucesso');
  }

  protected mudar(tipo: keyof PreferenciasAlerta, evento: Event): void {
    const atual = this.store.dados()?.preferencias;
    if (!atual) return;
    void this.store.salvarPreferencias({ ...atual, [tipo]: (evento.target as HTMLInputElement).checked });
  }
}
