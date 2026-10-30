import { Injectable, computed, inject, signal } from '@angular/core';
import { codigoDeErro, mensagemDeErro } from '../../../core/http/problema';
import { ConfiguracoesApi } from './configuracoes.api';
import { AtualizarModeloRequest, Configuracao, CriarModeloRequest, Modelo, SalvarPreferenciasRequest } from './configuracoes.models';

/** Resultado do botão "Testar chave", pronto para a tela. */
export type ResultadoTeste =
  | { tipo: 'valida'; mensagem: string }
  | { tipo: 'invalida' | 'erro'; mensagem: string };

/**
 * Estado da tela de Configurações: a configuração do usuário e a tabela de modelos.
 * Escopo da rota (providers da página). A API key digitada só passa por aqui a caminho da API e nunca é guardada.
 */
@Injectable()
export class ConfiguracoesStore {
  private readonly api = inject(ConfiguracoesApi);

  readonly configuracao = signal<Configuracao | null>(null);
  readonly modelos = signal<Modelo[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  /** Só os ativos podem ser escolhidos como padrão. */
  readonly modelosAtivos = computed(() => this.modelos().filter((m) => m.ativo));

  /** O padrão salvo foi desativado pelo ADMIN: a tela avisa para escolher outro. */
  readonly modeloPadraoInativo = computed(() => {
    const id = this.configuracao()?.modeloPadraoId;
    return !!id && !this.modelosAtivos().some((m) => m.modeloId === id);
  });

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const [configuracao, modelos] = await Promise.all([this.api.obter(), this.api.listarModelos()]);
      this.configuracao.set(configuracao);
      this.modelos.set(modelos);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  /** Devolve a mensagem de erro (para o formulário mostrar) ou null se deu certo. */
  async salvarChave(chaveApi: string): Promise<string | null> {
    try {
      this.configuracao.set(await this.api.salvarChave(chaveApi));
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }

  async removerChave(): Promise<string | null> {
    try {
      this.configuracao.set(await this.api.removerChave());
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }

  /** Decide pelo code: chave recusada é "inválida" (vermelho), Anthropic fora/limitando é "erro" (tente depois). */
  async testarChave(): Promise<ResultadoTeste> {
    try {
      await this.api.testarChave();
      return { tipo: 'valida', mensagem: 'Chave válida: a Anthropic aceitou a sua API key.' };
    } catch (e) {
      const codigo = codigoDeErro(e);
      if (codigo === 'Configuracoes.ChaveNaoConfigurada') {
        // Ex.: a chave salva não decifra mais: recarrega para a tela pedir uma nova
        await this.carregar();
      }
      return { tipo: codigo === 'Anthropic.ChaveInvalida' ? 'invalida' : 'erro', mensagem: mensagemDeErro(e) };
    }
  }

  async salvarPreferencias(request: SalvarPreferenciasRequest): Promise<string | null> {
    try {
      this.configuracao.set(await this.api.salvarPreferencias(request));
      return null;
    } catch (e) {
      if (codigoDeErro(e) === 'Configuracoes.ModeloInvalido') {
        // Alguém desativou o modelo enquanto a tela estava aberta: atualiza a lista
        this.modelos.set(await this.api.listarModelos().catch(() => this.modelos()));
      }
      return mensagemDeErro(e);
    }
  }

  // ---- Tabela de modelos (ADMIN) ----

  async criarModelo(request: CriarModeloRequest): Promise<string | null> {
    try {
      const novo = await this.api.criarModelo(request);
      this.modelos.update((l) => [...l, novo]);
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }

  async atualizarModelo(modeloId: string, request: AtualizarModeloRequest): Promise<string | null> {
    try {
      const atualizado = await this.api.atualizarModelo(modeloId, request);
      this.modelos.update((l) => l.map((m) => (m.modeloId === modeloId ? atualizado : m)));
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }
}
