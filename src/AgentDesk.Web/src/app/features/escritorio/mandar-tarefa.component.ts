import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { atualizarPeriodicamente } from '../../core/tempo-real/atualizacao-periodica';
import { formatarHaQuanto } from '../../shared/util/formatos';
import { ROTULO_STATUS_TAREFA, TEXTO_MAXIMO_TAREFA, Tarefa } from './data-access/tarefas.models';
import { TarefasStore } from './data-access/tarefas.store';

/** Polling das tarefas: o computador busca a cada 5 s, então 5 s aqui acompanha sem pesar. */
export const INTERVALO_TAREFAS_MS = 5000;

/**
 * Manda uma tarefa para o Claude Code de um computador seu, numa pasta que VOCÊ liberou nele (comando `liberar` do coletor). O coletor
 * abre `claude -p` no modo padrão: cada pedido de permissão aparece em "Pedidos de permissão" e nada roda sem você aprovar.
 * [[ADR-018 - Mandar Tarefa para o Claude Code do PC]]
 */
@Component({
  selector: 'app-mandar-tarefa',
  providers: [TarefasStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-cartao tarefa" aria-labelledby="titulo-tarefa">
      <h2 id="titulo-tarefa">➕ Mandar tarefa para o Claude Code</h2>

      @if (!store.carregado() && !store.erro()) {
        <p class="ui-suave">Carregando…</p>
      } @else if (store.erro() && !store.computadores().length) {
        <p class="ui-erro" role="alert">{{ store.erro() }} Tentando de novo…</p>
      } @else if (!store.computadores().length) {
        <p class="ui-suave">
          Nenhum computador ouvindo ainda. No <strong>seu computador</strong>, dentro da pasta de um projeto, libere a pasta e deixe o coletor
          ouvindo (você decide onde o app pode mandar tarefas — nada sai do PC além do nome da pasta):
        </p>
        <pre class="comando" aria-label="Comandos para liberar uma pasta"><code>cd /caminho/do/projeto
node ~/.agentdesk/agentdesk-coletor.mjs liberar
node ~/.agentdesk/agentdesk-coletor.mjs escutar</code></pre>
        <p class="ui-suave dica">No Windows (PowerShell), troque <code>~</code> por <code>$HOME</code>. Ainda não conectou o Claude Code? Veja Configurações → Claude Code.</p>
      } @else {
        <form class="formulario" (submit)="$event.preventDefault(); store.enviar()">
          <div class="linha">
            <div class="campo">
              <label for="tarefa-computador">Computador</label>
              <select id="tarefa-computador" class="ui-entrada" (change)="store.escolherComputador($any($event.target).value)">
                @for (c of store.computadores(); track c.maquina) {
                  <option [value]="c.maquina" [selected]="c.maquina === store.computador()?.maquina">{{ c.maquina }} · {{ c.online ? 'online' : 'sem sinal' }}</option>
                }
              </select>
            </div>
            <div class="campo">
              <label for="tarefa-pasta">Pasta do projeto</label>
              <select id="tarefa-pasta" class="ui-entrada" (change)="store.projetoEscolhido.set($any($event.target).value)">
                @for (p of store.pastas(); track p.projetoChave) {
                  <option [value]="p.projetoChave" [selected]="p.projetoChave === store.pasta()?.projetoChave">{{ p.projeto }}</option>
                }
              </select>
            </div>
          </div>

          @if (store.computador(); as computador) {
            @if (!computador.online) {
              <p class="aviso" role="status">
                Este computador não deu sinal há um tempo (o coletor está fechado?). A tarefa espera até 10 minutos; depois expira.
              </p>
            }
          }

          <label for="tarefa-texto">O que o Claude Code deve fazer</label>
          <textarea id="tarefa-texto" class="ui-entrada" rows="4" [maxLength]="maximo" [value]="store.texto()" (input)="store.texto.set($any($event.target).value)"
                    placeholder="Ex.: Rode os testes e corrija o que falhar."></textarea>
          <div class="rodape">
            <span class="ui-suave contador">{{ store.tamanho() }} / {{ maximo }}</span>
            <button type="submit" class="ui-botao ui-botao--primario" [disabled]="!store.podeEnviar()">Enviar tarefa</button>
          </div>
          <p class="ui-suave dica">
            Roda no modo padrão: cada permissão que o Claude Code pedir aparece em “Pedidos de permissão” (e no celular), e nada é aprovado sozinho. O
            robô da tarefa aparece na sala do projeto; para interromper, use <strong>Parar</strong> nele.
          </p>
        </form>
        @if (store.erroEnvio()) {
          <p class="ui-erro" role="alert">{{ store.erroEnvio() }}</p>
        }
      }

      @if (store.tarefas().length) {
        <h3>Tarefas enviadas</h3>
        <ul class="tarefas" aria-label="Tarefas enviadas">
          @for (t of store.tarefas(); track t.tarefaId) {
            <li>
              <p class="texto">{{ resumo(t) }}</p>
              <p class="meta ui-suave">
                {{ t.projeto }} · {{ t.maquina }} · {{ haQuanto(t.criadaEm) }}
              </p>
              <p class="situacao">
                <span [class]="'status ' + t.status.toLowerCase()">{{ rotulo[t.status] }}</span>
                @if (t.erro) { <span class="ui-suave"> — {{ t.erro }}</span> }
                @if (t.status === 'PENDENTE') {
                  <button type="button" class="ui-botao" [attr.aria-label]="'Cancelar a tarefa: ' + resumo(t)" (click)="store.cancelar(t.tarefaId)">Cancelar</button>
                }
              </p>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    :host { display: block; margin-bottom: var(--ui-e3); }
    .tarefa { display: grid; gap: var(--ui-e3); }
    h2 { font-size: var(--ui-t-lg); }
    h3 { font-size: var(--ui-t-md); margin: var(--ui-e2) 0 0; }
    .formulario { display: grid; gap: var(--ui-e2); }
    .linha { display: grid; gap: var(--ui-e3); grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
    .campo { display: grid; gap: var(--ui-e1); }
    .rodape { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ui-e2); }
    .contador, .dica { font-size: var(--ui-t-xs); }
    .aviso { padding: var(--ui-e2) var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-alerta-fundo); font-size: var(--ui-t-sm); }
    .comando { margin: 0; padding: var(--ui-e3); overflow-x: auto; border-radius: var(--ui-raio-controle); background: var(--ui-superficie-2, var(--ui-superficie)); border: 1px solid var(--ui-linha); font-size: var(--ui-t-sm); }
    .tarefas { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); }
    .tarefas li { padding: var(--ui-e2) var(--ui-e3); border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle); display: grid; gap: 2px; }
    .texto { margin: 0; overflow-wrap: anywhere; }
    .meta, .situacao { margin: 0; font-size: var(--ui-t-xs); }
    .situacao { display: flex; flex-wrap: wrap; gap: var(--ui-e2); align-items: center; }
    .status { font-weight: 700; }
    .status.em_andamento { color: var(--ui-marca-tinta); }
    .status.concluida { color: #2b8a3e; }
    .status.falhou, .status.expirada { color: #c92a2a; }
    .status.pendente, .status.cancelada { color: var(--ui-texto-3); }
  `,
})
export class MandarTarefa {
  protected readonly store = inject(TarefasStore);
  protected readonly rotulo = ROTULO_STATUS_TAREFA;
  protected readonly maximo = TEXTO_MAXIMO_TAREFA;
  protected readonly haQuanto = (iso: string) => formatarHaQuanto(iso);
  protected readonly resumo = (t: Tarefa) => (t.texto.length > 90 ? `${t.texto.slice(0, 89)}…` : t.texto);

  constructor() {
    atualizarPeriodicamente(() => this.store.atualizar(), { intervaloMs: INTERVALO_TAREFAS_MS }, inject(DestroyRef));
  }
}
