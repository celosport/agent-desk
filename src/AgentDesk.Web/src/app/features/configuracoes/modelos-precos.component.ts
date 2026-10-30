import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Avisos } from '../../core/ui/avisos.service';
import { formatarDataHora, formatarDolar } from '../../shared/util/formatos';
import { Modelo } from './data-access/configuracoes.models';
import { ConfiguracoesStore } from './data-access/configuracoes.store';

/**
 * Tabela de modelos e preços (só ADMIN; a API também barra com 403). Preço novo vale para as próximas chamadas:
 * o histórico guarda o preço da época. [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]
 * Usa a store da página (ConfiguracoesStore vem do injetor do pai).
 */
@Component({
  selector: 'app-modelos-precos',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-cartao bloco" aria-labelledby="titulo-modelos">
      <h2 id="titulo-modelos">Modelos e preços</h2>
      <p class="ui-suave">Preços em US$ por milhão de tokens. Cache sem preço é cobrado como entrada. Só administradores editam.</p>

      <div class="rolagem">
        <table role="table" aria-label="Modelos e preços">
          <thead>
            <tr role="row">
              <th role="columnheader" scope="col">Modelo</th>
              <th role="columnheader" scope="col">Entrada</th>
              <th role="columnheader" scope="col">Saída</th>
              <th role="columnheader" scope="col">Cache (leitura)</th>
              <th role="columnheader" scope="col">Cache (escrita)</th>
              <th role="columnheader" scope="col">Situação</th>
              <th role="columnheader" scope="col"><span class="ui-visualmente-oculto">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (m of store.modelos(); track m.modeloId) {
              @if (editando() === m.modeloId) {
                <tr role="row" class="edicao" [formGroup]="formEdicao">
                  <td role="cell">
                    <label class="ui-visualmente-oculto" for="edicao-nome">Nome de exibição</label>
                    <input id="edicao-nome" class="ui-entrada" formControlName="nomeExibicao" />
                    <small class="ui-suave">{{ m.modeloId }}</small>
                  </td>
                  <td role="cell" data-rotulo="Entrada"><label class="ui-visualmente-oculto" for="edicao-entrada">Preço de entrada</label>
                    <input id="edicao-entrada" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoEntradaMTok" /></td>
                  <td role="cell" data-rotulo="Saída"><label class="ui-visualmente-oculto" for="edicao-saida">Preço de saída</label>
                    <input id="edicao-saida" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoSaidaMTok" /></td>
                  <td role="cell" data-rotulo="Cache (leitura)"><label class="ui-visualmente-oculto" for="edicao-cache-leitura">Preço do cache (leitura)</label>
                    <input id="edicao-cache-leitura" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoCacheLeituraMTok" /></td>
                  <td role="cell" data-rotulo="Cache (escrita)"><label class="ui-visualmente-oculto" for="edicao-cache-escrita">Preço do cache (escrita)</label>
                    <input id="edicao-cache-escrita" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoCacheEscritaMTok" /></td>
                  <td role="cell" data-rotulo="Situação"><label class="opcao"><input type="checkbox" formControlName="ativo" /> Ativo</label></td>
                  <td role="cell" class="acoes">
                    <button type="button" class="ui-botao ui-botao--primario" (click)="salvarEdicao(m.modeloId)">Salvar</button>
                    <button type="button" class="ui-botao ui-botao--fantasma" (click)="editando.set(null)">Cancelar</button>
                  </td>
                </tr>
              } @else {
                <tr role="row" [class.inativo]="!m.ativo">
                  <td role="cell">
                    <strong>{{ m.nomeExibicao }}</strong><br />
                    <small class="ui-suave">{{ m.modeloId }} · atualizado em {{ dataHora(m.atualizadoEm) }}</small>
                  </td>
                  <td role="cell" data-rotulo="Entrada">{{ dolar(m.precoEntradaMTok) }}</td>
                  <td role="cell" data-rotulo="Saída">{{ dolar(m.precoSaidaMTok) }}</td>
                  <td role="cell" data-rotulo="Cache (leitura)">{{ m.precoCacheLeituraMTok === undefined ? '—' : dolar(m.precoCacheLeituraMTok) }}</td>
                  <td role="cell" data-rotulo="Cache (escrita)">{{ m.precoCacheEscritaMTok === undefined ? '—' : dolar(m.precoCacheEscritaMTok) }}</td>
                  <td role="cell" data-rotulo="Situação">{{ m.ativo ? 'Ativo' : 'Inativo' }}</td>
                  <td role="cell">
                    <button type="button" class="ui-botao" [attr.aria-label]="'Editar ' + m.nomeExibicao" (click)="editar(m)">Editar</button>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (erroEdicao()) {
        <p class="ui-erro" role="alert">{{ erroEdicao() }}</p>
      }

      <h3>Adicionar modelo</h3>
      <form class="novo" [formGroup]="formNovo" (ngSubmit)="criar()" novalidate>
        <div class="ui-campo"><label for="novo-id">Id na API</label>
          <input id="novo-id" class="ui-entrada" placeholder="claude-..." formControlName="modeloId" /></div>
        <div class="ui-campo"><label for="novo-nome">Nome de exibição</label>
          <input id="novo-nome" class="ui-entrada" formControlName="nomeExibicao" /></div>
        <div class="ui-campo"><label for="novo-entrada">Entrada (US$/milhão)</label>
          <input id="novo-entrada" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoEntradaMTok" /></div>
        <div class="ui-campo"><label for="novo-saida">Saída (US$/milhão)</label>
          <input id="novo-saida" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoSaidaMTok" /></div>
        <div class="ui-campo"><label for="novo-cache-leitura">Cache leitura (opcional)</label>
          <input id="novo-cache-leitura" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoCacheLeituraMTok" /></div>
        <div class="ui-campo"><label for="novo-cache-escrita">Cache escrita (opcional)</label>
          <input id="novo-cache-escrita" class="ui-entrada" type="number" step="0.0001" min="0" formControlName="precoCacheEscritaMTok" /></div>
        <div class="enviar"><button type="submit" class="ui-botao ui-botao--primario" [disabled]="criando()">Adicionar modelo</button></div>
      </form>
      @if (erroNovo()) {
        <p class="ui-erro" role="alert">{{ erroNovo() }}</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); }
    h2 { font-size: var(--ui-t-lg); }
    h3 { font-size: var(--ui-t-md); margin-top: var(--ui-e3); }
    .rolagem { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: var(--ui-t-sm); }
    th, td { padding: var(--ui-e2); border-bottom: 1px solid var(--ui-linha); text-align: left; vertical-align: middle; }
    th { color: var(--ui-texto-2); font-weight: 600; white-space: nowrap; }
    td .ui-entrada { min-width: 6.5rem; }
    .inativo { color: var(--ui-texto-3); }
    .acoes { display: flex; gap: var(--ui-e1); }
    .opcao { display: flex; gap: var(--ui-e1); align-items: center; white-space: nowrap; }
    /*
     * Celular: cada modelo vira um cartão (rótulo à esquerda, valor à direita). Uma tabela larga, mesmo dentro de um
     * contêiner com rolagem, alargava o layout da página no Chrome do celular (o toque caía no lugar errado).
     */
    @media (max-width: 640px) {
      table, tbody, tr, td { display: block; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      tr { padding: var(--ui-e3) 0; border-bottom: 1px solid var(--ui-linha); }
      td { display: flex; justify-content: space-between; align-items: center; gap: var(--ui-e3); padding: var(--ui-e1) 0; border: 0; }
      td:first-child { display: block; }
      td[data-rotulo]::before { content: attr(data-rotulo); color: var(--ui-texto-2); }
      td .ui-entrada { min-width: 0; max-width: 10rem; }
      .edicao td:first-child .ui-entrada { max-width: none; }
    }
    .novo { display: grid; gap: var(--ui-e3); grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); align-items: end; }
  `,
})
export class ModelosPrecos {
  protected readonly store = inject(ConfiguracoesStore);
  private readonly avisos = inject(Avisos);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly dolar = (v: number) => formatarDolar(v);
  protected readonly dataHora = formatarDataHora;

  protected readonly editando = signal<string | null>(null);
  protected readonly criando = signal(false);
  protected readonly erroEdicao = signal<string | null>(null);
  protected readonly erroNovo = signal<string | null>(null);

  protected readonly formEdicao = this.fb.group({
    nomeExibicao: [''],
    precoEntradaMTok: this.fb.control<number | null>(null),
    precoSaidaMTok: this.fb.control<number | null>(null),
    precoCacheLeituraMTok: this.fb.control<number | null>(null),
    precoCacheEscritaMTok: this.fb.control<number | null>(null),
    ativo: [true],
  });

  protected readonly formNovo = this.fb.group({
    modeloId: [''],
    nomeExibicao: [''],
    precoEntradaMTok: this.fb.control<number | null>(null),
    precoSaidaMTok: this.fb.control<number | null>(null),
    precoCacheLeituraMTok: this.fb.control<number | null>(null),
    precoCacheEscritaMTok: this.fb.control<number | null>(null),
  });

  protected editar(m: Modelo): void {
    this.erroEdicao.set(null);
    this.formEdicao.reset({
      nomeExibicao: m.nomeExibicao,
      precoEntradaMTok: m.precoEntradaMTok,
      precoSaidaMTok: m.precoSaidaMTok,
      precoCacheLeituraMTok: m.precoCacheLeituraMTok ?? null,
      precoCacheEscritaMTok: m.precoCacheEscritaMTok ?? null,
      ativo: m.ativo,
    });
    this.editando.set(m.modeloId);
  }

  protected async salvarEdicao(modeloId: string): Promise<void> {
    const v = this.formEdicao.getRawValue();
    const erro = await this.store.atualizarModelo(modeloId, {
      nomeExibicao: v.nomeExibicao.trim(),
      precoEntradaMTok: numero(v.precoEntradaMTok) as number,
      precoSaidaMTok: numero(v.precoSaidaMTok) as number,
      precoCacheLeituraMTok: numero(v.precoCacheLeituraMTok),
      precoCacheEscritaMTok: numero(v.precoCacheEscritaMTok),
      ativo: v.ativo,
    });
    this.erroEdicao.set(erro);
    if (!erro) {
      this.editando.set(null);
      this.avisos.mostrar('Modelo atualizado.', 'sucesso');
    }
  }

  protected async criar(): Promise<void> {
    const v = this.formNovo.getRawValue();
    this.criando.set(true);
    const erro = await this.store.criarModelo({
      modeloId: v.modeloId.trim(),
      nomeExibicao: v.nomeExibicao.trim(),
      precoEntradaMTok: numero(v.precoEntradaMTok) as number,
      precoSaidaMTok: numero(v.precoSaidaMTok) as number,
      precoCacheLeituraMTok: numero(v.precoCacheLeituraMTok),
      precoCacheEscritaMTok: numero(v.precoCacheEscritaMTok),
    });
    this.criando.set(false);
    this.erroNovo.set(erro);
    if (!erro) {
      this.formNovo.reset();
      this.avisos.mostrar('Modelo adicionado.', 'sucesso');
    }
  }
}

/** Campo numérico vazio = null (a API valida os obrigatórios e responde com a mensagem do campo). */
export function numero(valor: number | string | null): number | null {
  return valor === null || valor === '' ? null : Number(valor);
}
