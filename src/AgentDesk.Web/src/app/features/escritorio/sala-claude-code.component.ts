import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { atualizarPeriodicamente } from '../../core/tempo-real/atualizacao-periodica';
import { formatarDolarCompacto, formatarDuracao, formatarHaQuanto, formatarHora, formatarIntervalo, formatarNumero } from '../../shared/util/formatos';
import { CenaEscritorio } from './cena-escritorio.component';
import { EquipeStore } from './data-access/equipe.store';
import { SessaoAoVivo } from './data-access/sessoes.models';
import { SessoesStore } from './data-access/sessoes.store';
import { acompanharMovimentoReduzido } from './movimento-reduzido';
import { StatusSessao } from './motor/sessao';

/** Polling do "ao vivo": rápido o bastante para o balão acompanhar o Claude Code, leve para o servidor. */
export const INTERVALO_AO_VIVO_MS = 3000;

const ROTULO: Record<StatusSessao, string> = {
  TRABALHANDO: 'Trabalhando',
  ESPERANDO_VOCE: '✋ Precisa de você',
  OCIOSA: 'Ociosa',
  ENCERRADA: 'Encerrada',
};

/**
 * Sessões REAIS do Claude Code (da sua assinatura), ao vivo: cada projeto é uma sala e cada sessão um robô. Os dados chegam
 * pelos hooks e pela telemetria do Claude Code no seu PC (coletor), conectado em Configurações → Claude Code.
 * [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
 */
@Component({
  selector: 'app-sala-claude-code',
  imports: [RouterLink, CenaEscritorio],
  providers: [SessoesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topo">
      <p class="ui-suave">Ao vivo · atualiza a cada 3 s</p>
      @if (store.esperandoVoce()) {
        <p class="alerta" role="status">✋ {{ store.esperandoVoce() }} sessão(ões) precisam de você</p>
      }
    </div>

    @if (store.erro()) {
      <p class="ui-erro" role="alert">{{ store.erro() }} Tentando de novo…</p>
    }

    @if (!store.carregado() && !store.erro()) {
      <p class="ui-suave">Carregando…</p>
    } @else if (store.carregado() && !store.projetos().length) {
      <section class="ui-cartao vazio">
        <h2>Nenhuma sessão do Claude Code nas últimas 12 h</h2>
        <p class="ui-suave">
          Conecte o Claude Code do seu computador: gere um token em Configurações e rode o comando de instalação. As sessões novas
          aparecem aqui sozinhas — cada projeto vira uma sala e cada sessão, um robô.
        </p>
        <a class="ui-botao ui-botao--primario" routerLink="/configuracoes" fragment="claude-code">Conectar o Claude Code</a>
      </section>
    } @else if (store.projeto(); as projeto) {
      <div class="projetos" role="group" aria-label="Projetos">
        @for (p of store.projetos(); track p.chave) {
          <button type="button" class="ui-botao" [attr.aria-pressed]="p.chave === projeto.chave" (click)="store.escolherProjeto(p.chave)">
            {{ p.nome }} · {{ p.sessoes.length }}{{ temAlerta(p.sessoes) ? ' ✋' : '' }}
          </button>
        }
      </div>

      <div class="layout">
        <section class="ui-cartao sala" [attr.aria-label]="'Sala ' + projeto.nome">
          <app-cena-escritorio [fonte]="store" [descricao]="store.descricao()" />
          @if (store.foraDaSala()) {
            <p class="ui-suave dica">+{{ store.foraDaSala() }} sessões não cabem na sala (veja na lista).</p>
          }
        </section>

        <section class="ui-cartao painel" aria-labelledby="titulo-sessoes">
          <h2 id="titulo-sessoes">Sessões em {{ projeto.nome }}</h2>
          <ul class="sessoes" aria-label="Sessões">
            @for (s of projeto.sessoes; track s.sessaoId) {
              <li>
                <button type="button" class="sessao" [attr.aria-pressed]="s.sessaoId === store.selecionado()" (click)="store.selecionar(s.sessaoId)">
                  <span class="cor" [style.background]="store.visualDe(s.sessaoId).paleta.b" aria-hidden="true"></span>
                  <span class="nomes"><strong>{{ store.apelido(s.sessaoId) }}</strong> <span class="ui-suave">{{ s.maquina }}</span></span>
                  <span [class]="'status ' + s.status.toLowerCase()">{{ rotulo[s.status] }}</span>
                  <span class="atividade">{{ s.atividade ?? '—' }}</span>
                  <span class="numeros ui-suave">
                    {{ tempo(s) }} · {{ numero(s.tokens) }} tokens · ≈ {{ dolar(s.custoUsd) }} · {{ s.pedidos }} pedidos · {{ haQuanto(s.ultimaAtividadeEm) }}
                    @if (s.modelo) { · {{ s.modelo }} }
                  </span>
                </button>
              </li>
            }
          </ul>
          @if (store.selecionado(); as selecionada) {
            @if (store.agenteDaSessao(selecionada); as agente) {
              <button type="button" class="ui-botao" (click)="equipe.pedirEdicao(agente)">Personalizar {{ store.apelido(selecionada) }}</button>
            }
          }
          <p class="ui-suave dica">≈ valor = quanto as chamadas custariam na API (convertido pela moeda escolhida no topo); na assinatura você não paga por token.</p>
        </section>
      </div>
    }
    <p class="ui-visualmente-oculto" aria-live="polite">{{ store.anuncio() }}</p>
  `,
  styles: `
    :host { display: block; }
    .topo { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ui-e2); margin-bottom: var(--ui-e3); }
    .alerta { padding: var(--ui-e1) var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-alerta-fundo); font-weight: 700; }
    .vazio { display: grid; gap: var(--ui-e3); justify-items: start; }
    h2 { font-size: var(--ui-t-lg); }
    .projetos { display: flex; flex-wrap: wrap; gap: var(--ui-e2); margin-bottom: var(--ui-e3); }
    .projetos [aria-pressed='true'] { background: var(--ui-marca); color: var(--ui-marca-texto); border-color: var(--ui-marca); }
    .layout { display: grid; gap: var(--ui-e4); grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .sala { display: grid; gap: var(--ui-e2); overflow: hidden; }
    .dica { font-size: var(--ui-t-xs); }
    .painel { display: grid; gap: var(--ui-e3); grid-template-columns: minmax(0, 1fr); }
    .sessoes { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); max-height: 34rem; overflow-y: auto; }
    .sessao { width: 100%; display: grid; grid-template-columns: auto 1fr auto; gap: 2px var(--ui-e2); align-items: center; text-align: left;
      padding: var(--ui-e2) var(--ui-e3); border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle);
      background: var(--ui-superficie); color: inherit; font: inherit; cursor: pointer; }
    .sessao[aria-pressed='true'] { border-color: var(--ui-marca); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-marca) 30%, transparent); }
    .cor { width: 14px; height: 14px; border-radius: 3px; }
    .nomes { display: flex; flex-wrap: wrap; gap: 0 var(--ui-e2); align-items: baseline; min-width: 0; }
    .status { font-size: var(--ui-t-xs); font-weight: 700; white-space: nowrap; }
    .status.trabalhando { color: var(--ui-marca-tinta); }
    .status.esperando_voce { color: #e67700; }
    .status.ociosa, .status.encerrada { color: var(--ui-texto-3); }
    .atividade, .numeros { grid-column: 2 / -1; overflow-wrap: anywhere; }
    .numeros { font-size: var(--ui-t-xs); }
  `,
})
export class SalaClaudeCode {
  protected readonly store = inject(SessoesStore);
  protected readonly equipe = inject(EquipeStore);
  protected readonly rotulo = ROTULO;
  protected readonly numero = formatarNumero;
  protected readonly dolar = formatarDolarCompacto;
  protected readonly haQuanto = (iso: string) => formatarHaQuanto(iso);
  /** Quando a sessão começou e quanto tempo dura (ou durou, se já encerrou). */
  protected readonly tempo = (s: SessaoAoVivo) =>
    s.status === 'ENCERRADA'
      ? `${formatarIntervalo(s.iniciadaEm, s.ultimaAtividadeEm)}`
      : `iniciada às ${formatarHora(s.iniciadaEm)} · ${formatarDuracao(Date.now() - new Date(s.iniciadaEm).getTime())}`;
  protected readonly temAlerta = (sessoes: { status: StatusSessao }[]) => sessoes.some((s) => s.status === 'ESPERANDO_VOCE');

  constructor() {
    const destroy = inject(DestroyRef);
    acompanharMovimentoReduzido((r) => (this.store.reduzido = r), destroy);
    atualizarPeriodicamente(() => this.store.atualizar(), { intervaloMs: INTERVALO_AO_VIVO_MS }, destroy);
  }
}
