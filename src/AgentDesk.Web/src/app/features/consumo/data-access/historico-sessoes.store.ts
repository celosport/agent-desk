import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { ClaudeCodeApi } from './claude-code.api';
import { EscopoClaudeCode, FiltroHistoricoSessoes, LinhaDoTempo, PaginaHistoricoSessoes, SessaoHistorico } from './claude-code.models';
import { agruparPorHora } from './sessoes-historico.util';

export const TAMANHO_PAGINA_SESSOES = 20;

const FILTRO_INICIAL: FiltroHistoricoSessoes = { escopo: 'MEU', projeto: '', de: '', ate: '', pagina: 1, tamanho: TAMANHO_PAGINA_SESSOES };

/** Estado do histórico de sessões (90 dias): filtros, página atual e a sessão aberta com a linha do tempo hora a hora. */
@Injectable()
export class HistoricoSessoesStore {
  private readonly api = inject(ClaudeCodeApi);

  readonly filtro = signal<FiltroHistoricoSessoes>(FILTRO_INICIAL);
  readonly pagina = signal<PaginaHistoricoSessoes | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly linha = signal<LinhaDoTempo | null>(null);
  readonly erroLinha = signal<string | null>(null);

  readonly totalPaginas = computed(() => {
    const p = this.pagina();
    return p ? Math.max(1, Math.ceil(p.total / p.tamanho)) : 1;
  });
  readonly grupos = computed(() => agruparPorHora(this.linha()?.eventos ?? []));

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    const filtro = this.filtro();
    try {
      const pagina = await this.api.historico(filtro);
      if (filtro !== this.filtro()) return; // o filtro mudou enquanto carregava
      this.pagina.set(pagina);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  async filtrar(parcial: Partial<FiltroHistoricoSessoes>): Promise<void> {
    // Mudar o escopo ou o filtro volta para a página 1 e fecha a sessão aberta
    this.filtro.update((f) => ({ ...f, ...parcial, pagina: parcial.pagina ?? 1 }));
    this.linha.set(null);
    await this.carregar();
  }

  async trocarEscopo(escopo: EscopoClaudeCode): Promise<void> {
    if (escopo === this.filtro().escopo) return;
    await this.filtrar({ escopo, projeto: '' });
  }

  async irParaPagina(pagina: number): Promise<void> {
    await this.filtrar({ pagina: Math.min(Math.max(1, pagina), this.totalPaginas()) });
  }

  async abrir(sessao: SessaoHistorico): Promise<void> {
    this.erroLinha.set(null);
    try {
      this.linha.set(await this.api.linhaDoTempo(sessao.sessaoId, this.filtro().escopo));
    } catch (e) {
      this.linha.set(null);
      this.erroLinha.set(mensagemDeErro(e));
    }
  }

  fechar(): void {
    this.linha.set(null);
    this.erroLinha.set(null);
  }
}
