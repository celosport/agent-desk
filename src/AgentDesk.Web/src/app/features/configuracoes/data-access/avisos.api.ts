import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { Destinatario, EnviarAvisoRequest, EnvioAviso } from './avisos.models';

/** Único lugar com as URLs do aviso push do ADMIN (módulo Notificacoes). */
@Injectable({ providedIn: 'root' })
export class AvisosApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/notificacoes/admin`;

  destinatarios(): Promise<Destinatario[]> {
    return firstValueFrom(this.http.get<Destinatario[]>(`${this.base}/destinatarios`));
  }

  enviar(pedido: EnviarAvisoRequest): Promise<EnvioAviso> {
    return firstValueFrom(this.http.post<EnvioAviso>(`${this.base}/aviso`, pedido));
  }
}
