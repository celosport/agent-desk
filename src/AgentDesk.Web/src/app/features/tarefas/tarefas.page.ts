import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Avisos } from '../../core/ui/avisos.service';
import { EstadoVazio } from '../../shared/ui/estado-vazio.component';
import { formatarDataHora } from '../../shared/util/formatos';
import { TarefasStore } from './data-access/tarefas.store';

/**
 * Feature de EXEMPLO (espelha o módulo Tarefas da API). Para criar a sua: copie a pasta `features/tarefas`,
 * renomeie, ajuste `data-access/` (models = DTOs, api = URLs, store = estado) e registre a rota e o item do menu.
 */
@Component({
  selector: 'app-tarefas',
  imports: [ReactiveFormsModule, EstadoVazio],
  providers: [TarefasStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina">
      <h1 class="ui-titulo-pagina">Tarefas</h1>

      <form class="nova" [formGroup]="form" (ngSubmit)="criar()" novalidate>
        <label class="ui-visualmente-oculto" for="titulo">Nova tarefa</label>
        <input id="titulo" class="ui-entrada" placeholder="O que precisa ser feito?" maxlength="120" formControlName="titulo" />
        <button type="submit" class="ui-botao ui-botao--primario" [disabled]="enviando()">Adicionar</button>
      </form>
      @if (erroForm()) {
        <p class="ui-erro" role="alert">{{ erroForm() }}</p>
      }

      @if (store.carregando() && !store.tarefas().length) {
        <p class="ui-suave">Carregando…</p>
      } @else if (store.erro()) {
        <p class="ui-erro" role="alert">{{ store.erro() }}</p>
        <button type="button" class="ui-botao" (click)="store.carregar()">Tentar de novo</button>
      } @else if (!store.tarefas().length) {
        <app-estado-vazio titulo="Nenhuma tarefa ainda" descricao="Escreva a primeira acima e toque em Adicionar." />
      } @else {
        <h2 class="secao">Pendentes ({{ store.pendentes().length }})</h2>
        <ul class="lista" aria-label="Tarefas pendentes">
          @for (t of store.pendentes(); track t.tarefaId) {
            <li class="ui-cartao">
              <div>
                <p class="titulo">{{ t.titulo }}</p>
                <p class="ui-suave data">Criada em {{ data(t.criadaEm) }}</p>
              </div>
              <button type="button" class="ui-botao" [attr.aria-label]="'Concluir ' + t.titulo" (click)="concluir(t.tarefaId)">Concluir</button>
            </li>
          }
        </ul>
        @if (store.concluidas().length) {
          <h2 class="secao">Concluídas ({{ store.concluidas().length }})</h2>
          <ul class="lista" aria-label="Tarefas concluídas">
            @for (t of store.concluidas(); track t.tarefaId) {
              <li class="ui-cartao concluida">
                <div>
                  <p class="titulo">{{ t.titulo }}</p>
                  <p class="ui-suave data">Concluída em {{ data(t.concluidaEm) }}</p>
                </div>
              </li>
            }
          </ul>
        }
      }
    </main>
  `,
  styles: `
    .nova { display: flex; gap: var(--ui-e2); }
    .secao { font-size: var(--ui-t-lg); margin: var(--ui-e6) 0 var(--ui-e3); }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); }
    .lista li { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-e3); }
    .titulo { font-weight: 600; overflow-wrap: anywhere; }
    .data { font-size: var(--ui-t-xs); }
    .concluida .titulo { text-decoration: line-through; color: var(--ui-texto-2); }
  `,
})
export class TarefasPage {
  protected readonly store = inject(TarefasStore);
  private readonly avisos = inject(Avisos);

  protected readonly form = inject(NonNullableFormBuilder).group({
    titulo: ['', [Validators.required, Validators.maxLength(120)]],
  });
  protected readonly enviando = signal(false);
  protected readonly erroForm = signal<string | null>(null);
  protected readonly data = formatarDataHora;

  constructor() {
    void this.store.carregar();
  }

  protected async criar(): Promise<void> {
    const titulo = this.form.controls.titulo.value.trim();
    if (!titulo) {
      this.erroForm.set('Escreva o título da tarefa.');
      return;
    }
    this.enviando.set(true);
    const erro = await this.store.criar(titulo);
    this.enviando.set(false);
    this.erroForm.set(erro);
    if (!erro) {
      this.form.reset();
      this.avisos.mostrar('Tarefa adicionada.', 'sucesso');
    }
  }

  protected async concluir(tarefaId: string): Promise<void> {
    const erro = await this.store.concluir(tarefaId);
    this.avisos.mostrar(erro ?? 'Tarefa concluída.', erro ? 'erro' : 'sucesso');
  }
}
