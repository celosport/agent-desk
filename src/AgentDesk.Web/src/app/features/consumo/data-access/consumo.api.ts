import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { ChamadaDetalhe, EscopoConsumo, FiltroHistorico, FiltrosConsumo, PaginaChamadas, ResumoConsumo } from './consumo.models';
import { parametrosHistorico } from './consumo.util';

/** Único lugar que conhece as URLs do módulo Consumo. */
@Injectable({ providedIn: 'root' })
export class ConsumoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/consumo`;

  resumo(escopo: EscopoConsumo, dias = 30): Promise<ResumoConsumo> {
    return firstValueFrom(this.http.get<ResumoConsumo>(`${this.base}/resumo`, { params: { escopo, dias } }));
  }

  chamadas(filtro: FiltroHistorico): Promise<PaginaChamadas> {
    return firstValueFrom(this.http.get<PaginaChamadas>(`${this.base}/chamadas`, { params: parametrosHistorico(filtro) }));
  }

  chamada(chamadaId: string): Promise<ChamadaDetalhe> {
    return firstValueFrom(this.http.get<ChamadaDetalhe>(`${this.base}/chamadas/${chamadaId}`));
  }

  filtros(escopo: EscopoConsumo): Promise<FiltrosConsumo> {
    return firstValueFrom(this.http.get<FiltrosConsumo>(`${this.base}/filtros`, { params: { escopo } }));
  }
}
