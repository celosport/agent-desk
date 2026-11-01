import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { DispositivoAlerta, EnvioTeste, Notificacoes, PreferenciasAlerta, RegistrarDispositivoRequest } from './alertas.models';

/** Único lugar com as URLs dos alertas no celular (módulo Notificacoes). */
@Injectable({ providedIn: 'root' })
export class AlertasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/notificacoes`;

  obter(): Promise<Notificacoes> {
    return firstValueFrom(this.http.get<Notificacoes>(this.base));
  }

  registrar(pedido: RegistrarDispositivoRequest): Promise<DispositivoAlerta> {
    return firstValueFrom(this.http.post<DispositivoAlerta>(`${this.base}/dispositivos`, pedido));
  }

  /** O endereço vai no corpo: é longo demais para a URL. */
  remover(endpoint: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/dispositivos/remover`, { endpoint }));
  }

  salvarPreferencias(preferencias: PreferenciasAlerta): Promise<PreferenciasAlerta> {
    return firstValueFrom(this.http.put<PreferenciasAlerta>(`${this.base}/preferencias`, preferencias));
  }

  testar(): Promise<EnvioTeste> {
    return firstValueFrom(this.http.post<EnvioTeste>(`${this.base}/teste`, {}));
  }
}
