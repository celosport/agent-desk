import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';

describe('authInterceptor', () => {
  const sair = vi.fn();
  let http: HttpClient;
  let controle: HttpTestingController;

  beforeEach(() => {
    sair.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.teste' },
        { provide: AuthStore, useValue: { token: () => 'abc', sair } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controle = TestBed.inject(HttpTestingController);
  });

  it('anexa o Bearer só nas chamadas à nossa API', () => {
    void firstValueFrom(http.get('https://api.teste/api/v1/tarefas'));
    void firstValueFrom(http.get('https://outro.site/dados'));
    expect(controle.expectOne('https://api.teste/api/v1/tarefas').request.headers.get('Authorization')).toBe('Bearer abc');
    expect(controle.expectOne('https://outro.site/dados').request.headers.has('Authorization')).toBe(false);
  });

  it('401 da API encerra a sessão; 401 do login não', async () => {
    const tarefas = firstValueFrom(http.get('https://api.teste/api/v1/tarefas')).catch(() => undefined);
    controle.expectOne('https://api.teste/api/v1/tarefas').flush(null, { status: 401, statusText: 'Unauthorized' });
    await tarefas;
    expect(sair).toHaveBeenCalledTimes(1);

    const login = firstValueFrom(http.post('https://api.teste/api/v1/auth/login', {})).catch(() => undefined);
    controle.expectOne('https://api.teste/api/v1/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
    await login;
    expect(sair).toHaveBeenCalledTimes(1);
  });
});
