import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { ConsumoApi } from './consumo.api';
import { ChamadaDetalhe, EscopoConsumo, FiltroHistorico, FiltrosConsumo, PaginaChamadas } from './consumo.models';

export const TAMANHO_PAGINA = 20;

const FILTRO_INICIAL: FiltroHistorico = {
  escopo: 'MEU',
  de: '',
  ate: '',
  automacaoId: '',
  modeloId: '',
  status: '',
  pagina: 1,
  tamanho: TAMANHO_PAGINA,
};

/** Estado do histórico: filtros, página atual e a chamada aberta (com o resultado). */
@Injectable()
export class HistoricoStore {
  private readonly api = inject(ConsumoApi);

  readonly filtro = signal<FiltroHistorico>(FILTRO_INICIAL);
  readonly pagina = signal<PaginaChamadas | null>(null);
  readonly opcoes = signal<FiltrosConsumo>({ automacoes: [], modelos: [] });
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly detalhe = signal<ChamadaDetalhe | null>(null);
  readonly erroDetalhe = signal<string | null>(null);

  readonly totalPaginas = computed(() => {
    const p = this.pagina();
    return p ? Math.max(1, Math.ceil(p.total / p.tamanho)) : 1;
  });

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    const filtro = this.filtro();
    try {
      const [pagina, opcoes] = await Promise.all([this.api.chamadas(filtro), this.api.filtros(filtro.escopo)]);
      if (filtro !== this.filtro()) return; // filtro mudou enquanto carregava
      this.pagina.set(pagina);
      this.opcoes.set(opcoes);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  /** Aplica filtros novos e volta para a página 1. */
  async filtrar(mudancas: Partial<Omit<FiltroHistorico, 'pagina' | 'tamanho'>>): Promise<void> {
    this.filtro.update((f) => ({ ...f, ...mudancas, pagina: 1 }));
    this.detalhe.set(null);
    await this.carregar();
  }

  async limpar(escopo: EscopoConsumo = this.filtro().escopo): Promise<void> {
    this.filtro.set({ ...FILTRO_INICIAL, escopo });
    this.detalhe.set(null);
    await this.carregar();
  }

  async irPara(pagina: number): Promise<void> {
    const destino = Math.min(Math.max(1, pagina), this.totalPaginas());
    if (destino === this.filtro().pagina) return;
    this.filtro.update((f) => ({ ...f, pagina: destino }));
    await this.carregar();
  }

  async abrir(chamadaId: string): Promise<void> {
    this.erroDetalhe.set(null);
    try {
      this.detalhe.set(await this.api.chamada(chamadaId));
    } catch (e) {
      this.detalhe.set(null);
      this.erroDetalhe.set(mensagemDeErro(e));
    }
  }

  fechar(): void {
    this.detalhe.set(null);
  }
}
