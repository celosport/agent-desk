import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthStore } from './auth.store';

/** Anexa o Bearer só nas chamadas à nossa API e encerra a sessão em 401 (token vencido/revogado). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const api = inject(API_BASE_URL);
  const token = auth.token();
  const ehApi = req.url.startsWith(`${api}/api/`);
  const ehAuth = req.url.includes('/api/v1/auth/login') || req.url.includes('/api/v1/auth/cadastro');

  const requisicao = token && ehApi && !ehAuth ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(requisicao).pipe(
    catchError((erro: unknown) => {
      if (erro instanceof HttpErrorResponse && erro.status === 401 && ehApi && !ehAuth) auth.sair();
      return throwError(() => erro);
    }),
  );
};
