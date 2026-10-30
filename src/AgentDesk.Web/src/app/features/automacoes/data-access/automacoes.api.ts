import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { AtualizarAutomacaoRequest, Automacao, Execucao, ExecutarAutomacaoRequest, ModeloOpcao } from './automacoes.models';

/** Único lugar que conhece as URLs usadas pela tela de automações. A chamada à Claude acontece na API, nunca aqui. */
@Injectable({ providedIn: 'root' })
export class AutomacoesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1`;

  listar(): Promise<Automacao[]> {
    return firstValueFrom(this.http.get<Automacao[]>(`${this.base}/automacoes`));
  }

  atualizar(automacaoId: string, request: AtualizarAutomacaoRequest): Promise<Automacao> {
    return firstValueFrom(this.http.put<Automacao>(`${this.base}/automacoes/${automacaoId}`, request));
  }

  executar(automacaoId: string, request: ExecutarAutomacaoRequest): Promise<Execucao> {
    return firstValueFrom(this.http.post<Execucao>(`${this.base}/automacoes/${automacaoId}/executar`, request));
  }

  listarModelos(): Promise<ModeloOpcao[]> {
    return firstValueFrom(this.http.get<ModeloOpcao[]>(`${this.base}/modelos`));
  }
}
