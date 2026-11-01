import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { AlertasApi } from './alertas.api';
import { InscricaoPush, Notificacoes, PreferenciasAlerta } from './alertas.models';
import { EstadoPush, PUSH_NAVEGADOR, nomeDoAparelho } from './push-navegador';

/**
 * Alertas no celular: junta o que o servidor sabe (aparelhos e preferências) com o que o navegador sabe (permissão e inscrição de
 * push). "Ativo neste aparelho" = a inscrição do navegador está na lista do servidor. [[Módulo Notificacoes]]
 */
@Injectable()
export class AlertasStore {
  private readonly api = inject(AlertasApi);
  private readonly push = inject(PUSH_NAVEGADOR);

  readonly dados = signal<Notificacoes | null>(null);
  readonly inscricao = signal<InscricaoPush | null>(null);
  readonly estado = signal<EstadoPush>('indisponivel');
  readonly carregando = signal(false);
  readonly ocupado = signal(false);
  readonly erro = signal<string | null>(null);

  readonly ativoNesteAparelho = computed(() => {
    const atual = this.inscricao();
    return !!atual && (this.dados()?.dispositivos.some((d) => d.endpoint === atual.endpoint) ?? false);
  });

  /** Os outros aparelhos do usuário (o celular, quando se está no computador, e vice-versa). */
  readonly outrosAparelhos = computed(() => {
    const atual = this.inscricao()?.endpoint;
    return (this.dados()?.dispositivos ?? []).filter((d) => d.endpoint !== atual);
  });

  async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      this.estado.set(this.push.estado());
      this.inscricao.set(await this.push.inscricaoAtual());
      this.dados.set(await this.api.obter());
      this.erro.set(null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  /** Chamar direto de um clique: o navegador só pede a permissão a partir de um gesto do usuário. */
  async ativar(): Promise<boolean> {
    const dados = this.dados();
    if (!dados) return false;
    return this.executar(async () => {
      let inscricao: InscricaoPush;
      try {
        inscricao = await this.push.inscrever(dados.chavePublica);
      } catch (e) {
        // Permissão negada no pedido do navegador: a tela passa a explicar como liberar
        this.estado.set(this.push.estado());
        if (this.estado() === 'bloqueado') return false;
        throw e;
      }
      const registrado = await this.api.registrar({ ...inscricao, nome: nomeDoAparelho(navigator.userAgent) });
      this.inscricao.set(inscricao);
      this.dados.update((d) => d && { ...d, dispositivos: [...d.dispositivos.filter((x) => x.endpoint !== registrado.endpoint), registrado] });
      return true;
    });
  }

  async desativar(): Promise<boolean> {
    const atual = this.inscricao();
    if (!atual) return false;
    return this.executar(async () => {
      await this.api.remover(atual.endpoint);
      await this.push.cancelar();
      this.inscricao.set(null);
      this.dados.update((d) => d && { ...d, dispositivos: d.dispositivos.filter((x) => x.endpoint !== atual.endpoint) });
      return true;
    });
  }

  /** Devolve em quantos aparelhos o alerta de teste chegou (null se falhou: a mensagem fica em `erro`). */
  async testar(): Promise<number | null> {
    this.ocupado.set(true);
    try {
      const envio = await this.api.testar();
      this.erro.set(null);
      return envio.entregues;
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      return null;
    } finally {
      this.ocupado.set(false);
    }
  }

  async salvarPreferencias(preferencias: PreferenciasAlerta): Promise<void> {
    const anteriores = this.dados()?.preferencias;
    this.dados.update((d) => d && { ...d, preferencias }); // a caixa marca na hora; volta se o servidor recusar
    try {
      await this.api.salvarPreferencias(preferencias);
      this.erro.set(null);
    } catch (e) {
      this.dados.update((d) => (d && anteriores ? { ...d, preferencias: anteriores } : d));
      this.erro.set(mensagemDeErro(e));
    }
  }

  private async executar(acao: () => Promise<boolean>): Promise<boolean> {
    this.ocupado.set(true);
    try {
      const ok = await acao();
      this.erro.set(null);
      return ok;
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }
}
