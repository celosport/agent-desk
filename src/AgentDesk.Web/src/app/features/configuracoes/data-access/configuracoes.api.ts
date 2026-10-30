import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import {
  AtualizarModeloRequest,
  Configuracao,
  CriarModeloRequest,
  Modelo,
  SalvarPreferenciasRequest,
  TesteChave,
} from './configuracoes.models';

/** Único lugar que conhece as URLs do módulo Configuracoes (configurações do usuário e tabela de modelos). */
@Injectable({ providedIn: 'root' })
export class ConfiguracoesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1`;

  obter(): Promise<Configuracao> {
    return firstValueFrom(this.http.get<Configuracao>(`${this.base}/configuracoes`));
  }

  salvarChave(chaveApi: string): Promise<Configuracao> {
    return firstValueFrom(this.http.put<Configuracao>(`${this.base}/configuracoes/chave-api`, { chaveApi }));
  }

  removerChave(): Promise<Configuracao> {
    return firstValueFrom(this.http.delete<Configuracao>(`${this.base}/configuracoes/chave-api`));
  }

  testarChave(): Promise<TesteChave> {
    return firstValueFrom(this.http.post<TesteChave>(`${this.base}/configuracoes/chave-api/testar`, {}));
  }

  salvarPreferencias(request: SalvarPreferenciasRequest): Promise<Configuracao> {
    return firstValueFrom(this.http.put<Configuracao>(`${this.base}/configuracoes/preferencias`, request));
  }

  listarModelos(): Promise<Modelo[]> {
    return firstValueFrom(this.http.get<Modelo[]>(`${this.base}/modelos`));
  }

  criarModelo(request: CriarModeloRequest): Promise<Modelo> {
    return firstValueFrom(this.http.post<Modelo>(`${this.base}/modelos`, request));
  }

  atualizarModelo(modeloId: string, request: AtualizarModeloRequest): Promise<Modelo> {
    return firstValueFrom(this.http.put<Modelo>(`${this.base}/modelos/${encodeURIComponent(modeloId)}`, request));
  }
}
