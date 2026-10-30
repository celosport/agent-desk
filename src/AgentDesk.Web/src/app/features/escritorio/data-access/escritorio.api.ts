import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { AutomacaoAgente, ExecucaoResumo } from './escritorio.models';

/** Único lugar com as URLs do Escritório: as mesmas da API de automações (a Claude é chamada pelo servidor). */
@Injectable({ providedIn: 'root' })
export class EscritorioApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/automacoes`;

  automacoes(): Promise<AutomacaoAgente[]> {
    return firstValueFrom(this.http.get<AutomacaoAgente[]>(this.base));
  }

  executar(automacaoId: string, entrada: string): Promise<ExecucaoResumo> {
    return firstValueFrom(this.http.post<ExecucaoResumo>(`${this.base}/${automacaoId}/executar`, { entrada, modeloId: null, nomeArquivo: null }));
  }
}
