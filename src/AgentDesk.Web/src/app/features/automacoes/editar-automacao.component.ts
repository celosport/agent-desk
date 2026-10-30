import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Avisos } from '../../core/ui/avisos.service';
import { Automacao } from './data-access/automacoes.models';
import { AutomacoesStore } from './data-access/automacoes.store';

/** ADMIN edita o fluxo (a API também barra com 403). Usa a store da página. */
@Component({
  selector: 'app-editar-automacao',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="edicao" [formGroup]="form" (ngSubmit)="salvar()" novalidate aria-label="Editar automação">
      <div class="linha">
        <div class="ui-campo crescer"><label for="ed-nome">Nome</label>
          <input id="ed-nome" class="ui-entrada" maxlength="80" formControlName="nome" /></div>
        <div class="ui-campo crescer"><label for="ed-modelo">Modelo da automação</label>
          <select id="ed-modelo" class="ui-entrada" formControlName="modeloId">
            <option value="">Modelo padrão de cada usuário</option>
            @for (m of store.modelosAtivos(); track m.modeloId) {
              <option [value]="m.modeloId">{{ m.nomeExibicao }}</option>
            }
          </select></div>
        <div class="ui-campo"><label for="ed-max">Máximo de tokens da resposta</label>
          <input id="ed-max" class="ui-entrada" type="number" min="1" max="64000" formControlName="maxTokens" /></div>
      </div>
      <div class="ui-campo"><label for="ed-descricao">Descrição</label>
        <input id="ed-descricao" class="ui-entrada" maxlength="300" formControlName="descricao" /></div>
      <div class="ui-campo"><label for="ed-sistema">Prompt de sistema</label>
        <textarea id="ed-sistema" class="ui-entrada texto" rows="4" formControlName="promptSistema"></textarea></div>
      <div class="ui-campo"><label for="ed-mensagem">Modelo da mensagem (use {{ marcador }} onde entra o texto do usuário)</label>
        <textarea id="ed-mensagem" class="ui-entrada texto" rows="5" formControlName="modeloMensagem"></textarea></div>
      <label class="opcao"><input type="checkbox" formControlName="ativa" /> Automação ativa (aparece para todos)</label>
      <div><button type="submit" class="ui-botao ui-botao--primario" [disabled]="salvando()">Salvar fluxo</button></div>
      @if (erro()) {
        <p class="ui-erro" role="alert">{{ erro() }}</p>
      }
    </form>
  `,
  styles: `
    .edicao { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); padding: var(--ui-e3);
      border: 1px dashed var(--ui-linha); border-radius: var(--ui-raio); }
    .linha { display: flex; flex-wrap: wrap; gap: var(--ui-e3); }
    .crescer { flex: 1 1 14rem; min-width: 0; }
    .texto { min-height: 6rem; padding: var(--ui-e3); resize: vertical; }
    .opcao { display: flex; gap: var(--ui-e2); align-items: center; }
  `,
})
export class EditarAutomacao {
  readonly automacao = input.required<Automacao>();
  readonly salva = output<void>();

  protected readonly store = inject(AutomacoesStore);
  private readonly avisos = inject(Avisos);
  protected readonly marcador = '{{entrada}}';
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: [''],
    descricao: [''],
    promptSistema: [''],
    modeloMensagem: [''],
    modeloId: [''],
    maxTokens: [1000],
    ativa: [true],
  });

  constructor() {
    effect(() => {
      const a = this.automacao();
      this.form.reset({
        nome: a.nome,
        descricao: a.descricao,
        promptSistema: a.promptSistema,
        modeloMensagem: a.modeloMensagem,
        modeloId: a.modeloId ?? '',
        maxTokens: a.maxTokens,
        ativa: a.ativa,
      });
      this.erro.set(null);
    });
  }

  protected async salvar(): Promise<void> {
    const v = this.form.getRawValue();
    this.salvando.set(true);
    const erro = await this.store.atualizar(this.automacao().automacaoId, {
      ...v,
      modeloId: v.modeloId || null,
      maxTokens: Number(v.maxTokens),
    });
    this.salvando.set(false);
    this.erro.set(erro);
    if (!erro) {
      this.avisos.mostrar('Fluxo salvo.', 'sucesso');
      this.salva.emit();
    }
  }
}
