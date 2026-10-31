import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { AgenteEquipe, AlvoAgente, SalvarAgenteEquipe } from './equipe.models';

/** Único lugar com as URLs da Equipe (nome e aparência dos agentes). */
@Injectable({ providedIn: 'root' })
export class EquipeApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/equipe`;

  listar(): Promise<AgenteEquipe[]> {
    return firstValueFrom(this.http.get<AgenteEquipe[]>(this.base));
  }

  salvar(agente: SalvarAgenteEquipe): Promise<AgenteEquipe> {
    return firstValueFrom(this.http.put<AgenteEquipe>(this.base, agente));
  }

  /** Volta o agente ao padrão do Escritório. */
  restaurar(alvo: AlvoAgente, chave: string, ordem: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${alvo}/${ordem}`, { params: new HttpParams().set('chave', chave) }));
  }
}
