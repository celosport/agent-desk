import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { Computador, EnviarTarefa, Tarefa } from './tarefas.models';

/** URLs de "mandar tarefa para o Claude Code do PC" (módulo Sessoes). [[ADR-018 - Mandar Tarefa para o Claude Code do PC]] */
@Injectable({ providedIn: 'root' })
export class TarefasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/sessoes`;

  computadores(): Promise<Computador[]> {
    return firstValueFrom(this.http.get<Computador[]>(`${this.base}/computadores`));
  }

  tarefas(): Promise<Tarefa[]> {
    return firstValueFrom(this.http.get<Tarefa[]>(`${this.base}/tarefas`));
  }

  enviar(tarefa: EnviarTarefa): Promise<Tarefa> {
    return firstValueFrom(this.http.post<Tarefa>(`${this.base}/tarefas`, tarefa));
  }

  /** Só tarefas que ainda não começaram; depois, o Parar do robô (mesmo id da sessão). */
  cancelar(tarefaId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/tarefas/${tarefaId}/cancelar`, null));
  }
}
