import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { atualizarPeriodicamente } from '../../core/tempo-real/atualizacao-periodica';
import { formatarDolarCompacto, formatarDuracao, formatarHaQuanto, formatarHora, formatarIntervalo, formatarNumero } from '../../shared/util/formatos';
import { CenaEscritorio } from './cena-escritorio.component';
import { MandarTarefa } from './mandar-tarefa.component';
import { EquipeStore } from './data-access/equipe.store';
import { Sala, codigoDoSubagente, detalheDaSala } from './data-access/salas';
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
  imports: [RouterLink, CenaEscritorio, MandarTarefa],
  providers: [SessoesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topo">
      <p class="ui-suave">Ao vivo · atualiza a cada 3 s@if (store.ajudantesAtivos()) { · 👥 {{ store.ajudantesAtivos() }} ajudante(s) trabalhando}</p>
      @if (store.esperandoVoce()) {
        <p class="alerta" role="status">✋ {{ store.esperandoVoce() }} sessão(ões) precisam de você</p>
      }
    </div>

    @if (store.erro()) {
      <p class="ui-erro" role="alert">{{ store.erro() }} Tentando de novo…</p>
    }

    @if (store.permissoes().length) {
      <section class="ui-cartao permissoes" aria-labelledby="titulo-permissoes">
        <h2 id="titulo-permissoes">✋ Pedidos de permissão</h2>
        <ul>
          @for (p of store.permissoes(); track p.permissao.permissaoId) {
            <li>
              <p>
                <strong>{{ store.nomeParaPedido(p.sessaoId, p.projeto, p.noProjetoAtual) }}</strong> ({{ p.projeto }}) quer usar
                <code>{{ p.permissao.ferramenta }}</code>@if (p.permissao.resumo) {: <code>{{ p.permissao.resumo }}</code>}
              </p>
              <div class="acoes">
                <button type="button" class="ui-botao ui-botao--primario" [attr.aria-label]="'Aprovar ' + p.permissao.ferramenta + ' de ' + p.projeto"
                        (click)="store.decidir(p.permissao.permissaoId, 'APROVAR')">Aprovar</button>
                <button type="button" class="ui-botao" [attr.aria-label]="'Negar ' + p.permissao.ferramenta + ' de ' + p.projeto"
                        (click)="store.decidir(p.permissao.permissaoId, 'NEGAR')">Negar</button>
              </div>
            </li>
          }
        </ul>
        <p class="ui-suave dica">Sem resposta em cerca de 50 s, o Claude Code volta a perguntar no terminal. Nada é aprovado sozinho.</p>
      </section>
    }
    @if (store.erroControle()) {
      <p class="ui-erro" role="alert">{{ store.erroControle() }}</p>
    }

    <app-mandar-tarefa />

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
            {{ p.grupo ? '🗂️ ' : '' }}{{ p.nome }} · {{ detalhe(p) }}{{ temAlerta(p.sessoes) ? ' ✋' : '' }}
          </button>
        }
      </div>

      <div class="layout">
        <section class="ui-cartao sala" [attr.aria-label]="'Sala ' + projeto.nome">
          <app-cena-escritorio [fonte]="store" [descricao]="store.descricao()" />
          @if (store.foraDaSala()) {
            <p class="ui-suave dica">+{{ store.foraDaSala() }} robôs não cabem na sala (veja na lista).</p>
          }
          @for (h of store.homonimas(); track h.chave) {
            <p class="homonima" role="status">
              Há outra sala chamada “{{ h.nome }}” (outra pasta, worktree ou a nuvem).
              <button type="button" class="ui-botao" (click)="juntarHomonima(projeto.chave, h.chave, projeto.nome)">Juntar numa sala só</button>
            </p>
          }
        </section>

        <section class="ui-cartao painel" aria-labelledby="titulo-sessoes">
          <h2 id="titulo-sessoes">{{ projeto.grupo ? 'Grupo' : 'Sessões em' }} {{ projeto.nome }}</h2>
          <ul class="sessoes" aria-label="Sessões">
            @for (s of projeto.sessoes; track s.sessaoId) {
              <li>
                <button type="button" class="sessao" [attr.aria-pressed]="s.sessaoId === store.selecionado()" (click)="store.selecionar(s.sessaoId)">
                  <span class="cor" [style.background]="store.visualDe(s.sessaoId).paleta.b" aria-hidden="true"></span>
                  <span class="nomes"><strong>{{ store.apelido(s.sessaoId) }}</strong> <span class="ui-suave">{{ s.maquina }}@if (projeto.grupo) { · {{ nomeDoProjeto(projeto, s) }}}</span></span>
                  <span [class]="'status ' + s.status.toLowerCase()">{{ rotulo[s.status] }}</span>
                  @if (s.titulo) {
                    <span class="titulo-tarefa">{{ s.titulo }}</span>
                  }
                  <span class="atividade">{{ s.atividade ?? '—' }}</span>
                  <span class="numeros ui-suave">
                    {{ tempo(s) }} · {{ numero(s.tokens) }} tokens · ≈ {{ dolar(s.custoUsd) }} · {{ s.pedidos }} pedidos · {{ haQuanto(s.ultimaAtividadeEm) }}
                    @if (s.modelo) { · {{ s.modelo }} }
                  </span>
                </button>
                @if (s.subagentes?.length) {
                  <ul class="ajudantes" [attr.aria-label]="'Ajudantes de ' + store.apelido(s.sessaoId)">
                    @for (a of s.subagentes; track a.agenteId) {
                      <li>
                        <span class="cor" [style.background]="store.visualDe(codigoAjudante(s.sessaoId, a.agenteId)).paleta.b" aria-hidden="true"></span>
                        <strong>{{ a.tipo }}</strong>
                        <span [class]="'status ' + a.status.toLowerCase()">{{ a.status === 'ENCERRADA' ? 'Terminou' : 'Trabalhando' }}</span>
                        <span class="atividade ui-suave">{{ a.atividade ?? '—' }}</span>
                      </li>
                    }
                  </ul>
                }
              </li>
            }
          </ul>
          <details class="agrupar">
            <summary>Juntar salas</summary>
            <p class="ui-suave dica">
              Salas juntas viram uma só no Escritório: serve para worktrees, para o mesmo projeto no PC e na nuvem ou para vários serviços que
              trabalham juntos. Cada robô mantém o nome e a aparência da equipe do projeto dele.
            </p>
            @if (projeto.grupo) {
              <ul class="membros" aria-label="Projetos do grupo">
                @for (m of projeto.projetos; track m.chave) {
                  <li>{{ m.nome }} <button type="button" class="ui-botao" [attr.aria-label]="'Tirar ' + m.nome + ' do grupo'" (click)="store.agrupar(m.chave, null)">Tirar do grupo</button></li>
                }
              </ul>
            }
            @if (outrasSalas(projeto).length) {
              <div class="juntar">
                <label for="juntar-com">Juntar com</label>
                <select id="juntar-com" class="ui-entrada" [value]="escolhida()" (change)="escolhida.set($any($event.target).value)">
                  <option value="">Escolha uma sala…</option>
                  @for (o of outrasSalas(projeto); track o.chave) {
                    <option [value]="o.chave">{{ o.grupo ? '🗂️ ' : '' }}{{ o.nome }}</option>
                  }
                </select>
                @if (!projeto.grupo && !escolhidaEhGrupo()) {
                  <label for="nome-grupo">Nome do grupo</label>
                  <input id="nome-grupo" class="ui-entrada" maxlength="40" [value]="nomeGrupo()" (input)="nomeGrupo.set($any($event.target).value)" [placeholder]="projeto.nome" />
                }
                <button type="button" class="ui-botao ui-botao--primario" [disabled]="!escolhida()" (click)="juntar(projeto)">Juntar</button>
              </div>
            } @else if (!projeto.grupo) {
              <p class="ui-suave">Não há outra sala para juntar agora.</p>
            }
          </details>
          @if (store.selecionado(); as selecionada) {
            @if (store.agenteDaSessao(selecionada); as agente) {
              <div class="acoes">
                <button type="button" class="ui-botao" (click)="equipe.pedirEdicao(agente)">Personalizar {{ store.apelido(selecionada) }}</button>
                @if (sessaoDe(selecionada); as sessao) {
                  @if (sessao.pararSolicitado) {
                    <span class="ui-suave" role="status">⏹ Parada pedida: vale na próxima ferramenta de {{ store.apelido(selecionada) }}.</span>
                  } @else {
                    <button type="button" class="ui-botao" [disabled]="sessao.status === 'ENCERRADA'"
                            [attr.aria-label]="'Parar ' + store.apelido(selecionada)" (click)="store.parar(selecionada)">Parar {{ store.apelido(selecionada) }}</button>
                  }
                }
              </div>
              <p class="ui-suave dica">Parar interrompe o Claude Code na próxima ferramenta que ele for usar (não no meio de um pensamento). Precisa do coletor atualizado, com o controle ligado.</p>
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
    .titulo-tarefa { grid-column: 1 / -1; font-weight: 600; overflow-wrap: anywhere; }
    .nomes { display: flex; flex-wrap: wrap; gap: 0 var(--ui-e2); align-items: baseline; min-width: 0; }
    .status { font-size: var(--ui-t-xs); font-weight: 700; white-space: nowrap; }
    .status.trabalhando { color: var(--ui-marca-tinta); }
    .status.esperando_voce { color: #e67700; }
    .status.ociosa, .status.encerrada { color: var(--ui-texto-3); }
    .permissoes { margin-bottom: var(--ui-e3); display: grid; gap: var(--ui-e2); background: var(--ui-alerta-fundo); }
    .permissoes ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e3); }
    .permissoes code { overflow-wrap: anywhere; }
    .acoes { display: flex; flex-wrap: wrap; gap: var(--ui-e2); align-items: center; }
    .atividade, .numeros { grid-column: 2 / -1; overflow-wrap: anywhere; }
    .ajudantes { list-style: none; margin: var(--ui-e1) 0 0 var(--ui-e5); padding: 0 0 0 var(--ui-e3); border-left: 2px solid var(--ui-linha);
      display: grid; gap: var(--ui-e1); font-size: var(--ui-t-xs); }
    .ajudantes li { display: flex; flex-wrap: wrap; gap: 0 var(--ui-e2); align-items: baseline; }
    .ajudantes .cor { width: 10px; height: 10px; }
    .ajudantes .atividade { grid-column: auto; }
    .homonima { display: flex; flex-wrap: wrap; gap: var(--ui-e2); align-items: center; padding: var(--ui-e2) var(--ui-e3);
      border-radius: var(--ui-raio-controle); background: var(--ui-alerta-fundo); font-size: var(--ui-t-sm); }
    .agrupar { border-top: 1px solid var(--ui-linha); padding-top: var(--ui-e3); }
    .agrupar summary { cursor: pointer; font-weight: 700; }
    .juntar, .membros { display: grid; gap: var(--ui-e2); margin-top: var(--ui-e2); }
    .membros { list-style: none; padding: 0; margin-bottom: 0; }
    .membros li { display: flex; flex-wrap: wrap; gap: var(--ui-e2); align-items: center; justify-content: space-between; }
    .numeros { font-size: var(--ui-t-xs); }
  `,
})
export class SalaClaudeCode {
  protected readonly store = inject(SessoesStore);
  protected readonly equipe = inject(EquipeStore);
  protected readonly sessaoDe = (sessaoId: string): SessaoAoVivo | undefined =>
    this.store.sessoes().find((s) => s.sessaoId === sessaoId);
  protected readonly rotulo = ROTULO;
  protected readonly codigoAjudante = codigoDoSubagente;
  protected readonly escolhida = signal('');
  protected readonly nomeGrupo = signal('');
  protected readonly escolhidaEhGrupo = () => this.escolhida().startsWith('g:');

  /** Salas que dá para juntar à atual (num grupo, só as de um projeto só; senão, também grupos inteiros). */
  protected outrasSalas(atual: Sala): Sala[] {
    return this.store.projetos().filter((s) => s.chave !== atual.chave && (!atual.grupo || !s.grupo));
  }

  protected nomeDoProjeto(sala: Sala, s: SessaoAoVivo): string {
    return sala.projetos.find((p) => p.chave === s.projetoChave)?.nome ?? '';
  }

  /** Dois projetos de mesmo nome viram um grupo com esse nome. */
  protected async juntarHomonima(atual: string, outro: string, nome: string): Promise<void> {
    await this.store.agrupar(atual, nome);
    await this.store.agrupar(outro, nome);
  }

  protected async juntar(atual: Sala): Promise<void> {
    const alvo = this.store.projetos().find((s) => s.chave === this.escolhida());
    if (!alvo) return;
    const nome = atual.grupo ?? alvo.grupo ?? (this.nomeGrupo().trim() || atual.nome);
    for (const p of [...atual.projetos, ...alvo.projetos]) await this.store.agrupar(p.chave, nome);
    this.escolhida.set('');
    this.nomeGrupo.set('');
  }
  protected readonly numero = formatarNumero;
  protected readonly dolar = formatarDolarCompacto;
  protected readonly haQuanto = (iso: string) => formatarHaQuanto(iso);
  /** Quando a sessão começou e quanto tempo dura (ou durou, se já encerrou). */
  protected readonly tempo = (s: SessaoAoVivo) =>
    s.status === 'ENCERRADA'
      ? `${formatarIntervalo(s.iniciadaEm, s.ultimaAtividadeEm)}`
      : `iniciada às ${formatarHora(s.iniciadaEm)} · ${formatarDuracao(Date.now() - new Date(s.iniciadaEm).getTime())}`;
  protected readonly detalhe = detalheDaSala;
  protected readonly temAlerta =(sessoes: { status: StatusSessao }[]) => sessoes.some((s) => s.status === 'ESPERANDO_VOCE');

  constructor() {
    const destroy = inject(DestroyRef);
    acompanharMovimentoReduzido((r) => (this.store.reduzido = r), destroy);
    atualizarPeriodicamente(() => this.store.atualizar(), { intervaloMs: INTERVALO_AO_VIVO_MS }, destroy);
  }
}
