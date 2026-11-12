import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { AvisosApi } from './avisos.api';
import { Destinatario, EnvioAviso } from './avisos.models';

export const TITULO_CONVITE = 'Instale o Agent Desk';
export const MENSAGEM_CONVITE = 'Abra o app no celular e toque em Instalar app (iPhone: Compartilhar → Adicionar à Tela de Início).';

/** Frase do resultado do envio, em português claro. */
export function resumoDoEnvio(r: EnvioAviso): string {
  const partes = [`Aviso enviado para ${r.alcancados} de ${r.escolhidos} pessoa${r.escolhidos === 1 ? '' : 's'}.`];
  if (r.semAparelho > 0) partes.push(`${r.semAparelho} ainda não ativ${r.semAparelho === 1 ? 'ou' : 'aram'} os alertas no celular.`);
  if (r.falhas > 0) partes.push(`${r.falhas} com falha no serviço de push.`);
  return partes.join(' ');
}

/** Aviso push do ADMIN: quem recebe (uma, várias ou todas as pessoas) e o texto. [[Módulo Notificacoes]] */
@Injectable()
export class AvisosStore {
  private readonly api = inject(AvisosApi);

  readonly destinatarios = signal<Destinatario[]>([]);
  readonly selecionados = signal<ReadonlySet<string>>(new Set());
  readonly carregando = signal(false);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly resultado = signal<string | null>(null);

  readonly todosMarcados = computed(() => this.destinatarios().length > 0 && this.selecionados().size === this.destinatarios().length);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      this.destinatarios.set(await this.api.destinatarios());
      this.erro.set(null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  alternar(usuarioId: string): void {
    const novo = new Set(this.selecionados());
    if (!novo.delete(usuarioId)) novo.add(usuarioId);
    this.selecionados.set(novo);
  }

  alternarTodos(): void {
    this.selecionados.set(this.todosMarcados() ? new Set() : new Set(this.destinatarios().map((d) => d.usuarioId)));
  }

  /** Quem ainda não tem alertas ativos (o aviso não chega até a pessoa instalar e ativar). */
  marcarComAparelho(): void {
    this.selecionados.set(new Set(this.destinatarios().filter((d) => d.aparelhos > 0).map((d) => d.usuarioId)));
  }

  async enviar(titulo: string, mensagem: string): Promise<boolean> {
    if (this.selecionados().size === 0) {
      this.erro.set('Escolha pelo menos uma pessoa.');
      return false;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.resultado.set(null);
    try {
      // Todas marcadas = "todos": quem se cadastrar entre a lista e o envio também recebe
      const ids = this.todosMarcados() ? null : [...this.selecionados()];
      this.resultado.set(resumoDoEnvio(await this.api.enviar({ usuarioIds: ids, titulo: titulo.trim(), mensagem: mensagem.trim(), url: '/' })));
      return true;
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      return false;
    } finally {
      this.enviando.set(false);
    }
  }
}
