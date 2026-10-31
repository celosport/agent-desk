import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { EscopoClaudeCode, PainelClaudeCode } from './claude-code.models';

/** URLs do painel do Claude Code (dados do módulo Sessoes). */
@Injectable({ providedIn: 'root' })
export class ClaudeCodeApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/sessoes`;

  painel(escopo: EscopoClaudeCode, dias = 30): Promise<PainelClaudeCode> {
    return firstValueFrom(this.http.get<PainelClaudeCode>(`${this.base}/painel`, { params: { escopo, dias } }));
  }
}
