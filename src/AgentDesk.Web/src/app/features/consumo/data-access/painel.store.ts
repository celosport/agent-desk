import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { ConsumoApi } from './consumo.api';
import { EscopoConsumo, ResumoConsumo } from './consumo.models';
import { estadoLimite } from './consumo.util';

/**
 * Estado do painel de consumo. A página chama `atualizar()` por polling (core/tempo-real); uma falha mantém os números
 * anteriores na tela e só mostra o aviso (o polling tenta de novo, com espera maior).
 */
@Injectable()
export class PainelStore {
  private readonly api = inject(ConsumoApi);

  readonly escopo = signal<EscopoConsumo>('MEU');
  readonly resumo = signal<ResumoConsumo | null>(null);
  readonly erro = signal<string | null>(null);

  readonly estadoLimite = computed(() => estadoLimite(this.resumo()?.percentualLimite));
  readonly temDados = computed(() => (this.resumo()?.acumulado.chamadas ?? 0) > 0);

  /** Lança o erro de volta para o polling dobrar a espera. */
  async atualizar(): Promise<void> {
    const escopo = this.escopo();
    try {
      const resumo = await this.api.resumo(escopo);
      if (escopo !== this.escopo()) return; // trocaram o escopo no meio: a resposta é velha
      this.resumo.set(resumo);
      this.erro.set(null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      throw e;
    }
  }

  async trocarEscopo(escopo: EscopoConsumo): Promise<void> {
    if (escopo === this.escopo()) return;
    this.escopo.set(escopo);
    this.resumo.set(null);
    await this.atualizar().catch(() => undefined);
  }
}
