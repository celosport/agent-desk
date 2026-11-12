import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { API_BASE_URL } from '../config/api.config';
import { Sessao } from './auth.models';
import { AuthStore, CHAVE_SESSAO, CHAVE_SESSAO_ADMIN } from './auth.store';

describe('AuthStore — Ver como', () => {
  const daqui = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  const admin: Sessao = {
    accessToken: 'adm', tokenType: 'Bearer', expiraEm: daqui(30),
    usuario: { usuarioId: 'a', nome: 'Admin', email: 'a@x.dev', perfil: 'ADMIN' },
  };
  const visto: Sessao = {
    accessToken: 'vc', tokenType: 'Bearer', expiraEm: daqui(60),
    usuario: { usuarioId: 'u', nome: 'Ana', email: 'ana@x.dev', perfil: 'USUARIO' }, verComoPor: 'Admin',
  };
  let http: HttpTestingController;
  const navegar = vi.fn(async () => true);

  function iniciar(sessao: Sessao): AuthStore {
    localStorage.clear();
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    navegar.mockClear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '' }, { provide: Router, useValue: { navigateByUrl: navegar } }],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthStore);
  }

  it('entra como o usuário, guarda o admin e mostra quem está olhando', async () => {
    const auth = iniciar(admin);
    const promessa = auth.verComo('u');
    http.expectOne('/api/v1/auth/ver-como').flush(visto);
    await promessa;

    expect(auth.usuario()?.nome).toBe('Ana');
    expect(auth.verComoPor()).toBe('Admin');
    expect(JSON.parse(localStorage.getItem(CHAVE_SESSAO_ADMIN)!).accessToken).toBe('adm');
    expect(navegar).toHaveBeenCalledWith('/inicio');
  });

  it('sair do modo devolve a sessão do admin sem pedir senha', async () => {
    const auth = iniciar(admin);
    const promessa = auth.verComo('u');
    http.expectOne('/api/v1/auth/ver-como').flush(visto);
    await promessa;

    await auth.sairDoVerComo();

    expect(auth.usuario()?.perfil).toBe('ADMIN');
    expect(auth.verComoPor()).toBeNull();
    expect(localStorage.getItem(CHAVE_SESSAO_ADMIN)).toBeNull();
    expect(navegar).toHaveBeenLastCalledWith('/configuracoes');
  });

  it('se a sessão do admin já venceu, sair do modo leva ao login', async () => {
    const auth = iniciar(visto);
    localStorage.setItem(CHAVE_SESSAO_ADMIN, JSON.stringify({ ...admin, expiraEm: daqui(-5) }));

    await auth.sairDoVerComo();

    expect(auth.autenticado()).toBe(false);
    expect(navegar).toHaveBeenCalledWith('/entrar');
  });

  it('erro da API não troca a sessão', async () => {
    const auth = iniciar(admin);
    const promessa = auth.verComo('outro-admin');
    http.expectOne('/api/v1/auth/ver-como').flush({ code: 'Conta.VerComoSoUsuario' }, { status: 403, statusText: 'Forbidden' });

    await expect(promessa).rejects.toBeTruthy();
    expect(auth.usuario()?.perfil).toBe('ADMIN');
    expect(localStorage.getItem(CHAVE_SESSAO_ADMIN)).toBeNull();
  });
});
