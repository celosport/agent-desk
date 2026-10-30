import { Injectable, computed, inject, signal } from '@angular/core';
import { codigoDeErro, mensagemDeErro } from '../../../core/http/problema';
import { AutomacoesApi } from './automacoes.api';
import { AtualizarAutomacaoRequest, Automacao, Execucao, ExecutarAutomacaoRequest, ModeloOpcao } from './automacoes.models';

/** Falha de uma execução, pronta para a tela: a mensagem do servidor e se o caminho é ir para Configurações. */
export interface FalhaExecucao {
  codigo?: string;
  mensagem: string;
  /** Falta a chave ou o modelo padrão, ou bateu o limite: a tela oferece o link para Configurações. */
  irParaConfiguracoes: boolean;
}

const CODIGOS_DE_CONFIGURACAO = new Set([
  'Automacoes.ChaveNaoConfigurada',
  'Automacoes.ModeloNaoDefinido',
  'Automacoes.LimiteMensalAtingido',
  'Anthropic.ChaveInvalida',
]);

/** Estado da tela de automações (escopo da rota). Uma execução por vez. */
@Injectable()
export class AutomacoesStore {
  private readonly api = inject(AutomacoesApi);

  readonly automacoes = signal<Automacao[]>([]);
  readonly modelos = signal<ModeloOpcao[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly selecionadaId = signal<string | null>(null);
  /** Id da automação rodando agora (null = nenhuma). */
  readonly executando = signal<string | null>(null);
  readonly execucao = signal<Execucao | null>(null);
  readonly falha = signal<FalhaExecucao | null>(null);

  readonly selecionada = computed(() => this.automacoes().find((a) => a.automacaoId === this.selecionadaId()) ?? null);
  readonly modelosAtivos = computed(() => this.modelos().filter((m) => m.ativo));

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const [automacoes, modelos] = await Promise.all([this.api.listar(), this.api.listarModelos()]);
      this.automacoes.set(automacoes);
      this.modelos.set(modelos);
      if (!this.selecionada()) this.selecionadaId.set(automacoes.find((a) => a.ativa)?.automacaoId ?? null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  selecionar(automacaoId: string): void {
    if (this.executando()) return;
    this.selecionadaId.set(automacaoId);
    this.execucao.set(null);
    this.falha.set(null);
  }

  /** Nome do modelo para a tela ("Claude Opus 5.5"); cai no id se o modelo não estiver na lista. */
  nomeDoModelo(modeloId: string | undefined): string {
    if (!modeloId) return 'seu modelo padrão';
    return this.modelos().find((m) => m.modeloId === modeloId)?.nomeExibicao ?? modeloId;
  }

  async executar(request: ExecutarAutomacaoRequest): Promise<Execucao | null> {
    const automacao = this.selecionada();
    if (!automacao || this.executando()) return null;
    this.executando.set(automacao.automacaoId);
    this.execucao.set(null);
    this.falha.set(null);
    try {
      const execucao = await this.api.executar(automacao.automacaoId, request);
      this.execucao.set(execucao);
      return execucao;
    } catch (e) {
      const codigo = codigoDeErro(e);
      this.falha.set({ codigo, mensagem: mensagemDeErro(e), irParaConfiguracoes: !!codigo && CODIGOS_DE_CONFIGURACAO.has(codigo) });
      return null;
    } finally {
      this.executando.set(null);
    }
  }

  // ---- ADMIN ----

  async atualizar(automacaoId: string, request: AtualizarAutomacaoRequest): Promise<string | null> {
    try {
      const atualizada = await this.api.atualizar(automacaoId, request);
      this.automacoes.update((l) => l.map((a) => (a.automacaoId === automacaoId ? atualizada : a)));
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }
}
