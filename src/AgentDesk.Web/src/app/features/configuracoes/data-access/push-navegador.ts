import { Injectable, InjectionToken, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { InscricaoPush } from './alertas.models';

/**
 * O que este aparelho consegue fazer com alertas:
 * - `disponivel`: dá para pedir a permissão e se inscrever;
 * - `bloqueado`: o usuário negou a permissão nas configurações do navegador;
 * - `instalar-no-ios`: no iPhone/iPad os alertas só existem no app instalado na Tela de Início;
 * - `indisponivel`: navegador sem suporte (ou app sem service worker, como no `ng serve`).
 */
export type EstadoPush = 'disponivel' | 'bloqueado' | 'instalar-no-ios' | 'indisponivel';

/** A parte do navegador dos alertas (Notification + Push API), atrás de uma interface para os testes e o modo mock. */
export interface PushNavegador {
  estado(): EstadoPush;
  /** A inscrição que este navegador já tem (mesmo que o servidor ainda não conheça). */
  inscricaoAtual(): Promise<InscricaoPush | null>;
  /** Pede a permissão (se ainda não foi dada) e cria a inscrição. Só chamar dentro de um clique. */
  inscrever(chavePublica: string): Promise<InscricaoPush>;
  cancelar(): Promise<void>;
}

/** Quem usa o Safari do iPhone sem instalar o app na Tela de Início não recebe push. Função pura para poder testar. */
export function precisaInstalarNoIos(userAgent: string, instalado: boolean): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) && !instalado;
}

/** Nome para reconhecer o aparelho na lista ("iPhone · Safari", "Windows · Chrome"). */
export function nomeDoAparelho(userAgent: string): string {
  const sistema = /iPhone/i.test(userAgent) ? 'iPhone'
    : /iPad/i.test(userAgent) ? 'iPad'
    : /Android/i.test(userAgent) ? 'Android'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(userAgent) ? 'Mac'
    : /Linux/i.test(userAgent) ? 'Linux'
    : 'Aparelho';
  // Edge e Opera também dizem "Chrome": os mais específicos primeiro
  const navegador = /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox|FxiOS/.test(userAgent) ? 'Firefox'
    : /Chrome|CriOS/.test(userAgent) ? 'Chrome'
    : /Safari/.test(userAgent) ? 'Safari'
    : '';
  return navegador ? `${sistema} · ${navegador}` : sistema;
}

@Injectable({ providedIn: 'root' })
export class PushNavegadorReal implements PushNavegador {
  private readonly sw = inject(SwPush);

  estado(): EstadoPush {
    const instalado = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (precisaInstalarNoIos(navigator.userAgent, instalado)) return 'instalar-no-ios';
    if (!this.sw.isEnabled || !('Notification' in window) || !('PushManager' in window)) return 'indisponivel';
    return Notification.permission === 'denied' ? 'bloqueado' : 'disponivel';
  }

  async inscricaoAtual(): Promise<InscricaoPush | null> {
    if (!this.sw.isEnabled) return null;
    const inscricao = await firstValueFrom(this.sw.subscription);
    return inscricao ? paraInscricao(inscricao) : null;
  }

  async inscrever(chavePublica: string): Promise<InscricaoPush> {
    return paraInscricao(await this.sw.requestSubscription({ serverPublicKey: chavePublica }));
  }

  async cancelar(): Promise<void> {
    await this.sw.unsubscribe();
  }
}

function paraInscricao(inscricao: PushSubscription): InscricaoPush {
  const chaves = inscricao.toJSON().keys ?? {};
  return { endpoint: inscricao.endpoint, p256dh: chaves['p256dh'] ?? '', auth: chaves['auth'] ?? '' };
}

/**
 * Só para `start:mock` e os testes E2E (o Chrome sem cabeça não alcança um serviço de push de verdade): finge um aparelho que
 * aceita os alertas. Nunca é usado em produção (environment.mockApi = false).
 */
export class PushNavegadorFalso implements PushNavegador {
  private inscricao: InscricaoPush | null = null;

  estado(): EstadoPush {
    return 'disponivel';
  }

  async inscricaoAtual(): Promise<InscricaoPush | null> {
    return this.inscricao;
  }

  async inscrever(): Promise<InscricaoPush> {
    this.inscricao = { endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho-do-mock', p256dh: 'BMock-p256dh', auth: 'mock-auth' };
    return this.inscricao;
  }

  async cancelar(): Promise<void> {
    this.inscricao = null;
  }
}

export const PUSH_NAVEGADOR = new InjectionToken<PushNavegador>('PushNavegador', {
  providedIn: 'root',
  factory: () => (environment.mockApi ? new PushNavegadorFalso() : inject(PushNavegadorReal)),
});
