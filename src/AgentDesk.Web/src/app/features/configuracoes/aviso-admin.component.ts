import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AvisosStore, MENSAGEM_CONVITE, TITULO_CONVITE } from './data-access/avisos.store';

/** ADMIN: manda um aviso push (por padrão o convite para instalar o app) a quem for escolhido ou a todos. [[Módulo Notificacoes]] */
@Component({
  selector: 'app-aviso-admin',
  imports: [FormsModule],
  providers: [AvisosStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-cartao bloco" aria-labelledby="titulo-aviso">
      <h2 id="titulo-aviso">Avisar usuários (convite para instalar o app)</h2>
      <p class="ui-suave">
        Manda um alerta push para as pessoas escolhidas. Só chega a quem já ativou os alertas no celular; as outras aparecem
        marcadas como "sem alertas".
      </p>

      @if (store.carregando()) {
        <p class="ui-suave">Carregando…</p>
      } @else {
        <div class="acoes">
          <button type="button" class="ui-botao" (click)="store.alternarTodos()">
            {{ store.todosMarcados() ? 'Desmarcar todos' : 'Marcar todos' }}
          </button>
          <button type="button" class="ui-botao ui-botao--fantasma" (click)="store.marcarComAparelho()">Só quem tem alertas</button>
        </div>

        <ul class="lista" aria-label="Usuários">
          @for (d of store.destinatarios(); track d.usuarioId) {
            <li>
              <label class="opcao">
                <input type="checkbox" [checked]="store.selecionados().has(d.usuarioId)" (change)="store.alternar(d.usuarioId)" />
                <span>
                  <strong>{{ d.nome }}</strong> <span class="ui-suave">{{ d.email }}</span>
                  <span class="etiqueta" [class.sem]="d.aparelhos === 0">{{ d.aparelhos === 0 ? 'sem alertas' : d.aparelhos + (d.aparelhos === 1 ? ' aparelho' : ' aparelhos') }}</span>
                </span>
              </label>
            </li>
          }
        </ul>

        <div class="ui-campo">
          <label for="aviso-titulo">Título</label>
          <input id="aviso-titulo" class="ui-entrada" maxlength="60" [(ngModel)]="titulo" />
        </div>
        <div class="ui-campo">
          <label for="aviso-mensagem">Mensagem</label>
          <textarea id="aviso-mensagem" class="ui-entrada" rows="3" maxlength="240" [(ngModel)]="mensagem"></textarea>
        </div>

        @if (store.erro()) {
          <p class="ui-erro" role="alert">{{ store.erro() }}</p>
        }
        @if (store.resultado()) {
          <p class="ok" role="status">{{ store.resultado() }}</p>
        }
        <div class="acoes">
          <button type="button" class="ui-botao ui-botao--primario" [disabled]="store.enviando()" (click)="enviar()">
            {{ store.enviando() ? 'Enviando…' : 'Enviar aviso' }}
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); margin-bottom: var(--ui-e5); }
    h2 { font-size: var(--ui-t-lg); }
    .acoes { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); max-height: 20rem; overflow: auto; }
    .opcao { display: flex; gap: var(--ui-e2); align-items: flex-start; }
    .etiqueta { margin-left: var(--ui-e2); font-size: var(--ui-t-xs); color: var(--ui-verde); }
    .etiqueta.sem { color: var(--ui-vermelho); }
    .ok { font-weight: 600; color: var(--ui-verde); margin: 0; }
  `,
})
export class AvisoAdmin implements OnInit {
  protected readonly store = inject(AvisosStore);
  protected readonly titulo = signal(TITULO_CONVITE);
  protected readonly mensagem = signal(MENSAGEM_CONVITE);

  ngOnInit(): void {
    void this.store.carregar();
  }

  protected enviar(): void {
    void this.store.enviar(this.titulo(), this.mensagem());
  }
}
