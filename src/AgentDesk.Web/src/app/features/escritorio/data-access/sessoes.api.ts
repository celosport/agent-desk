import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { AoVivo } from './sessoes.models';

/** URL das sessões do Claude Code ao vivo (módulo Sessoes). */
@Injectable({ providedIn: 'root' })
export class SessoesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/sessoes`;

  /** Pede para parar a sessão: vale na próxima ferramenta que o Claude Code for usar. */
  parar(sessaoId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/${encodeURIComponent(sessaoId)}/parar`, null));
  }

  decidir(permissaoId: string, decisao: 'APROVAR' | 'NEGAR'): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/permissoes/${permissaoId}/decidir`, { decisao }));
  }

  aoVivo(): Promise<AoVivo> {
    return firstValueFrom(this.http.get<AoVivo>(`${this.base}/ao-vivo`));
  }
}
