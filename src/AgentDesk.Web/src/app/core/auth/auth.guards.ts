import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Perfil } from './auth.models';
import { AuthStore } from './auth.store';

/** Área inicial de cada perfil. Com perfis de áreas diferentes (ex.: cliente × profissional), separe aqui. */
export function rotaInicial(perfil: Perfil | undefined): string {
  switch (perfil) {
    case 'ADMIN':
      return '/inicio';
    default:
      return '/inicio';
  }
}

/** Qualquer conta logada. */
export const autenticadoGuard: CanActivateFn = () =>
  inject(AuthStore).autenticado() ? true : inject(Router).parseUrl('/entrar');

/** Telas de login/cadastro: quem já está logado vai direto para a sua área. */
export const anonimoGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.autenticado() ? inject(Router).parseUrl(rotaInicial(auth.usuario()?.perfil)) : true;
};

/** Área restrita a perfis: `canActivate: [perfilGuard('ADMIN')]`. Perfil errado volta para a área dele. */
export function perfilGuard(...perfis: Perfil[]): CanActivateFn {
  return () => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    if (!auth.autenticado()) return router.parseUrl('/entrar');
    const atual = auth.usuario()?.perfil;
    return atual && perfis.includes(atual) ? true : router.parseUrl(rotaInicial(atual));
  };
}
