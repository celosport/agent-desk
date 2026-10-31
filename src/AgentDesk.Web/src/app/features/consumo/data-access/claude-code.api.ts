import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { Dicas, EscopoClaudeCode, FiltroHistoricoSessoes, LinhaDoTempo, PaginaHistoricoSessoes, PainelClaudeCode } from './claude-code.models';

/** URLs do painel do Claude Code (dados do módulo Sessoes). */
@Injectable({ providedIn: 'root' })
export class ClaudeCodeApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/sessoes`;

  dicas(escopo: EscopoClaudeCode): Promise<Dicas> {
    return firstValueFrom(this.http.get<Dicas>(`${this.base}/dicas`, { params: { escopo } }));
  }

  historico(f: FiltroHistoricoSessoes): Promise<PaginaHistoricoSessoes> {
    const params: Record<string, string | number> = { escopo: f.escopo, pagina: f.pagina, tamanho: f.tamanho };
    if (f.projeto) params['projeto'] = f.projeto;
    if (f.de) params['de'] = f.de;
    if (f.ate) params['ate'] = f.ate;
    return firstValueFrom(this.http.get<PaginaHistoricoSessoes>(`${this.base}/historico`, { params }));
  }

  linhaDoTempo(sessaoId: string, escopo: EscopoClaudeCode): Promise<LinhaDoTempo> {
    return firstValueFrom(this.http.get<LinhaDoTempo>(`${this.base}/historico/${encodeURIComponent(sessaoId)}`, { params: { escopo } }));
  }

  painel(escopo: EscopoClaudeCode, dias = 30): Promise<PainelClaudeCode> {
    return firstValueFrom(this.http.get<PainelClaudeCode>(`${this.base}/painel`, { params: { escopo, dias } }));
  }
}
