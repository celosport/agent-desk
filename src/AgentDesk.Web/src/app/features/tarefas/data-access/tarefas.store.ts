import { Injectable, computed, inject, signal } from '@angular/core';
import { codigoDeErro, mensagemDeErro } from '../../../core/http/problema';
import { TarefasApi } from './tarefas.api';
import { Tarefa } from './tarefas.models';

/**
 * Estado da feature com signals (padrão para toda feature nova): a tela lê sinais e chama métodos;
 * a store fala com a API e traduz erros. Escopo da rota (providers da página), não global.
 */
@Injectable()
export class TarefasStore {
  private readonly api = inject(TarefasApi);

  readonly tarefas = signal<Tarefa[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly pendentes = computed(() => this.tarefas().filter((t) => t.status === 'PENDENTE'));
  readonly concluidas = computed(() => this.tarefas().filter((t) => t.status === 'CONCLUIDA'));

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      this.tarefas.set(await this.api.listar());
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  /** Devolve a mensagem de erro (para o formulário mostrar) ou null se deu certo. */
  async criar(titulo: string): Promise<string | null> {
    try {
      const nova = await this.api.criar({ titulo });
      this.tarefas.update((l) => [nova, ...l]);
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }

  async concluir(tarefaId: string): Promise<string | null> {
    try {
      const atualizada = await this.api.concluir(tarefaId);
      this.substituir(atualizada);
      return null;
    } catch (e) {
      // Decida pelo code estável da API, nunca pelo texto
      if (codigoDeErro(e) === 'Tarefas.JaConcluida') {
        await this.carregar();
        return null;
      }
      return mensagemDeErro(e);
    }
  }

  private substituir(tarefa: Tarefa): void {
    this.tarefas.update((l) => l.map((t) => (t.tarefaId === tarefa.tarefaId ? tarefa : t)));
  }
}
