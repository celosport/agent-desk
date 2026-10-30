import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { CriarTarefaRequest, StatusTarefa, Tarefa } from './tarefas.models';

/** Único lugar que conhece as URLs do módulo Tarefas. Telas e stores nunca montam URL. */
@Injectable({ providedIn: 'root' })
export class TarefasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/tarefas`;

  listar(status?: StatusTarefa): Promise<Tarefa[]> {
    return firstValueFrom(this.http.get<Tarefa[]>(this.base, { params: status ? { status } : {} }));
  }

  criar(request: CriarTarefaRequest): Promise<Tarefa> {
    return firstValueFrom(this.http.post<Tarefa>(this.base, request));
  }

  concluir(tarefaId: string): Promise<Tarefa> {
    return firstValueFrom(this.http.put<Tarefa>(`${this.base}/${tarefaId}/concluir`, {}));
  }
}
