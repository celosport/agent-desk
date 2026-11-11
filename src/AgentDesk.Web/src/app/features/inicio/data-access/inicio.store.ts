import { Injectable, computed, inject, signal } from '@angular/core';
import { InicioApi } from './inicio.api';
import { AoVivoApi, ConfiguracaoApi, DicasApi, EscopoInicio, LimitesApi, PainelCodeApi, ResumoApi } from './inicio.models';
import { estadoDoLimite, passosIniciais, resumirAoVivo } from './inicio.util';

/**
 * Estado do painel do Início. Cada fonte falha sozinha (o resto continua na tela); só mostra o aviso se NADA carregou.
 * A página chama `atualizar()` por polling (core/tempo-real).
 */
@Injectable()
export class InicioStore {
  private readonly api = inject(InicioApi);

  readonly escopo = signal<EscopoInicio>('MEU');
  readonly resumo = signal<ResumoApi | null>(null);
  readonly code = signal<PainelCodeApi | null>(null);
  readonly dicas = signal<DicasApi | null>(null);
  readonly limites = signal<LimitesApi | null>(null);
  readonly aoVivo = signal<AoVivoApi | null>(null);
  readonly configuracao = signal<ConfiguracaoApi | null>(null);
  readonly carregou = signal(false);
  readonly erro = signal<string | null>(null);

  readonly agora = computed(() => resumirAoVivo(this.aoVivo()));
  readonly estadoLimite = computed(() => estadoDoLimite(this.resumo()?.percentualLimite));
  /** O Claude Code conta como conectado se já mandou pedidos ou há sessão no ar. */
  readonly claudeCodeConectado = computed(() => (this.code()?.acumulado.pedidos ?? 0) > 0 || this.agora().ativas > 0);
  readonly passos = computed(() =>
    passosIniciais({
      chave: this.configuracao()?.chaveApiConfigurada ?? false,
      claudeCodeConectado: this.claudeCodeConectado(),
      rodouAutomacao: (this.resumo()?.acumulado.chamadas ?? 0) > 0,
    }),
  );
  /** Só depois de carregar a configuração (senão o cartão pisca na tela). */
  readonly mostrarPassos = computed(() => this.configuracao() !== null && this.passos().some((p) => !p.feito));

  /** Lança o erro de volta (quando nada carregou) para o polling dobrar a espera. */
  async atualizar(): Promise<void> {
    const escopo = this.escopo();
    const r = await Promise.allSettled([
      this.api.resumo(escopo),
      this.api.painelClaudeCode(escopo),
      this.api.dicas(escopo),
      this.api.limites(),
      this.api.aoVivo(),
      this.api.configuracao(),
    ]);
    if (escopo !== this.escopo()) return; // trocaram o escopo no meio: a resposta é velha
    const pegar = <T>(x: PromiseSettledResult<T>) => (x.status === 'fulfilled' ? x.value : undefined);
    const [resumo, code, dicas, limites, aoVivo, configuracao] = [pegar(r[0]), pegar(r[1]), pegar(r[2]), pegar(r[3]), pegar(r[4]), pegar(r[5])];
    if (resumo) this.resumo.set(resumo);
    if (code) this.code.set(code);
    if (dicas) this.dicas.set(dicas);
    if (limites) this.limites.set(limites);
    if (aoVivo) this.aoVivo.set(aoVivo);
    if (configuracao) this.configuracao.set(configuracao);
    const falhou = r.every((x) => x.status === 'rejected');
    this.erro.set(falhou ? 'Não consegui carregar o painel agora.' : null);
    this.carregou.set(true);
    if (falhou) throw new Error('painel indisponível');
  }

  async trocarEscopo(escopo: EscopoInicio): Promise<void> {
    if (escopo === this.escopo()) return;
    this.escopo.set(escopo);
    this.resumo.set(null);
    this.code.set(null);
    this.dicas.set(null);
    await this.atualizar().catch(() => undefined);
  }
}
