import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { AoVivoApi, ConfiguracaoApi, DicasApi, EscopoInicio, LimitesApi, PainelCodeApi, ResumoApi } from './inicio.models';

/** Único lugar que conhece as URLs que o Início consulta. */
@Injectable({ providedIn: 'root' })
export class InicioApi {
  private readonly http = inject(HttpClient);
  private readonly raiz = `${inject(API_BASE_URL)}/api/v1`;

  resumo(escopo: EscopoInicio, dias = 14): Promise<ResumoApi> {
    return firstValueFrom(this.http.get<ResumoApi>(`${this.raiz}/consumo/resumo`, { params: { escopo, dias } }));
  }

  painelClaudeCode(escopo: EscopoInicio, dias = 14): Promise<PainelCodeApi> {
    return firstValueFrom(this.http.get<PainelCodeApi>(`${this.raiz}/sessoes/painel`, { params: { escopo, dias } }));
  }

  dicas(escopo: EscopoInicio): Promise<DicasApi> {
    return firstValueFrom(this.http.get<DicasApi>(`${this.raiz}/sessoes/dicas`, { params: { escopo } }));
  }

  limites(): Promise<LimitesApi> {
    return firstValueFrom(this.http.get<LimitesApi>(`${this.raiz}/sessoes/limites`));
  }

  aoVivo(): Promise<AoVivoApi> {
    return firstValueFrom(this.http.get<AoVivoApi>(`${this.raiz}/sessoes/ao-vivo`));
  }

  configuracao(): Promise<ConfiguracaoApi> {
    return firstValueFrom(this.http.get<ConfiguracaoApi>(`${this.raiz}/configuracoes`));
  }
}
