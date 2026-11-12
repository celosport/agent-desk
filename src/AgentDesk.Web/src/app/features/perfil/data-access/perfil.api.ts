import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UsuarioLogado } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';

/** Único lugar que conhece as URLs do perfil (módulo Contas). Todas devolvem o usuário atualizado. */
@Injectable({ providedIn: 'root' })
export class PerfilApi {
  private readonly http = inject(HttpClient);
  private readonly raiz = `${inject(API_BASE_URL)}/api/v1/conta`;

  atualizarNome(nome: string): Promise<UsuarioLogado> {
    return firstValueFrom(this.http.put<UsuarioLogado>(`${this.raiz}/perfil`, { nome }));
  }

  enviarFoto(arquivo: Blob, nome: string): Promise<UsuarioLogado> {
    const form = new FormData();
    form.append('arquivo', arquivo, nome);
    return firstValueFrom(this.http.post<UsuarioLogado>(`${this.raiz}/foto`, form));
  }

  removerFoto(): Promise<UsuarioLogado> {
    return firstValueFrom(this.http.delete<UsuarioLogado>(`${this.raiz}/foto`));
  }
}
