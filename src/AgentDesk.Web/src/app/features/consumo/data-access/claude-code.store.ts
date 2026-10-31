import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { ClaudeCodeApi } from './claude-code.api';
import { ConsumoDia } from './consumo.models';
import { Dicas, EscopoClaudeCode, PainelClaudeCode } from './claude-code.models';

/** Estado do painel do Claude Code: polling como o painel de automações (falha mantém os números e avisa). */
@Injectable()
export class ClaudeCodeStore {
  private readonly api = inject(ClaudeCodeApi);

  readonly painel = signal<PainelClaudeCode | null>(null);
  readonly dicas = signal<Dicas | null>(null);
  readonly erro = signal<string | null>(null);
  private escopo: EscopoClaudeCode = 'MEU';

  readonly temDados = computed(() => (this.painel()?.acumulado.pedidos ?? 0) > 0);

  /** A série no formato do gráfico de barras (custo por dia). */
  readonly serieParaGrafico = computed<ConsumoDia[]>(() =>
    (this.painel()?.serie ?? []).map((d) => ({ dia: d.dia, chamadas: d.uso.pedidos, tokens: d.uso.tokens, custoUsd: d.uso.custoUsd })),
  );

  /** Dias recentes com uso, do mais novo para o mais antigo (a lista "cache por dia"). */
  readonly diasComUso = computed(() =>
    [...(this.painel()?.serie ?? [])].filter((d) => d.uso.pedidos > 0).reverse().slice(0, 7),
  );

  /** Lança o erro de volta para o polling dobrar a espera. */
  async atualizar(escopo: EscopoClaudeCode = this.escopo): Promise<void> {
    if (escopo !== this.escopo) {
      this.escopo = escopo;
      this.painel.set(null);
      this.dicas.set(null);
    }
    try {
      // As dicas são um extra: se falharem, o painel segue sem elas
      const [painel, dicas] = await Promise.all([this.api.painel(escopo), this.api.dicas(escopo).catch(() => null)]);
      if (escopo !== this.escopo) return; // trocaram o escopo no meio: a resposta é velha
      this.painel.set(painel);
      this.dicas.set(dicas);
      this.erro.set(null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      throw e;
    }
  }
}
