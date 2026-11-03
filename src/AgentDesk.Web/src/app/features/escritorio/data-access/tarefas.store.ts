import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { TarefasApi } from './tarefas.api';
import { Computador, PastaLiberada, TEXTO_MAXIMO_TAREFA, Tarefa } from './tarefas.models';

/**
 * Mandar tarefa para o Claude Code do PC: os computadores com o coletor ouvindo, as pastas liberadas NELES (a escolha de onde uma
 * tarefa pode rodar é do usuário, no PC) e as tarefas enviadas. O polling vem do componente.
 */
@Injectable()
export class TarefasStore {
  private readonly api = inject(TarefasApi);

  readonly computadores = signal<Computador[]>([]);
  readonly tarefas = signal<Tarefa[]>([]);
  readonly carregado = signal(false);
  readonly erro = signal<string | null>(null);
  readonly enviando = signal(false);
  /** Erro de enviar/cancelar (ex.: limite de 5 tarefas): aparece junto do formulário. */
  readonly erroEnvio = signal<string | null>(null);

  readonly maquinaEscolhida = signal('');
  readonly projetoEscolhido = signal('');
  readonly texto = signal('');

  /** O computador do formulário: o escolhido, ou o primeiro online, ou o primeiro. */
  readonly computador = computed<Computador | null>(() => {
    const lista = this.computadores();
    return lista.find((c) => c.maquina === this.maquinaEscolhida()) ?? lista.find((c) => c.online) ?? lista[0] ?? null;
  });
  readonly pastas = computed<PastaLiberada[]>(() => this.computador()?.pastas ?? []);
  readonly pasta = computed<PastaLiberada | null>(() => this.pastas().find((p) => p.projetoChave === this.projetoEscolhido()) ?? this.pastas()[0] ?? null);
  readonly tamanho = computed(() => this.texto().length);
  readonly podeEnviar = computed(() => !!this.computador() && !!this.pasta() && !!this.texto().trim() && this.tamanho() <= TEXTO_MAXIMO_TAREFA && !this.enviando());
  readonly abertas = computed(() => this.tarefas().filter((t) => t.status === 'PENDENTE' || t.status === 'EM_ANDAMENTO').length);

  async atualizar(): Promise<void> {
    try {
      const [computadores, tarefas] = await Promise.all([this.api.computadores(), this.api.tarefas()]);
      this.computadores.set(computadores);
      this.tarefas.set(tarefas);
      this.erro.set(null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      throw e;
    } finally {
      this.carregado.set(true);
    }
  }

  escolherComputador(maquina: string): void {
    this.maquinaEscolhida.set(maquina);
    this.projetoEscolhido.set('');
  }

  async enviar(): Promise<void> {
    const computador = this.computador();
    const pasta = this.pasta();
    if (!computador || !pasta || !this.podeEnviar()) return;
    this.enviando.set(true);
    this.erroEnvio.set(null);
    try {
      const criada = await this.api.enviar({ maquina: computador.maquina, projetoChave: pasta.projetoChave, texto: this.texto().trim() });
      this.tarefas.update((lista) => [criada, ...lista.filter((t) => t.tarefaId !== criada.tarefaId)]);
      this.texto.set('');
    } catch (e) {
      this.erroEnvio.set(mensagemDeErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async cancelar(tarefaId: string): Promise<void> {
    this.erroEnvio.set(null);
    try {
      await this.api.cancelar(tarefaId);
    } catch (e) {
      this.erroEnvio.set(mensagemDeErro(e));
    }
    await this.atualizar().catch(() => undefined);
  }
}
