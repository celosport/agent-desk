import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Origem da API (vazio = mesma origem, como em produção). Injetável para facilitar os testes. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});
