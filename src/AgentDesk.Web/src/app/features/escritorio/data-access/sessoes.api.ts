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

  aoVivo(): Promise<AoVivo> {
    return firstValueFrom(this.http.get<AoVivo>(`${this.base}/ao-vivo`));
  }
}
