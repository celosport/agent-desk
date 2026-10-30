import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { anonimoGuard, autenticadoGuard, perfilGuard } from './auth.guards';
import { Perfil } from './auth.models';
import { AuthStore } from './auth.store';

describe('guards de autenticação', () => {
  const executar = (guard: ReturnType<typeof perfilGuard>, autenticado: boolean, perfil?: Perfil) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { autenticado: () => autenticado, usuario: () => (perfil ? { perfil } : null) } }],
    });
    const resultado = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    return resultado instanceof UrlTree ? TestBed.inject(Router).serializeUrl(resultado) : resultado;
  };

  it('sem login, as telas logadas voltam para /entrar', () => {
    expect(executar(autenticadoGuard, false)).toBe('/entrar');
    expect(executar(perfilGuard('ADMIN'), false)).toBe('/entrar');
  });

  it('logado, pula o login e o cadastro', () => {
    expect(executar(anonimoGuard, true, 'USUARIO')).toBe('/inicio');
    expect(executar(anonimoGuard, false)).toBe(true);
  });

  it('perfil errado volta para a área dele', () => {
    expect(executar(perfilGuard('ADMIN'), true, 'USUARIO')).toBe('/inicio');
    expect(executar(perfilGuard('ADMIN', 'USUARIO'), true, 'USUARIO')).toBe(true);
  });
});
