import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { Sessao } from './auth.models';

export const CHAVE_SESSAO = 'agentdesk.sessao';

/**
 * Estado de autenticação com signals. A sessão fica no localStorage para o app abrir já logado
 * (inclusive offline); o token expira conforme `Jwt:ExpiracaoMinutos` da API.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = inject(API_BASE_URL);

  private readonly sessao = signal<Sessao | null>(lerSessaoSalva());

  readonly usuario = computed(() => this.sessao()?.usuario ?? null);
  readonly token = computed(() => this.sessao()?.accessToken ?? null);
  readonly autenticado = computed(() => {
    const s = this.sessao();
    return !!s && new Date(s.expiraEm).getTime() > Date.now();
  });
  readonly primeiroNome = computed(() => this.usuario()?.nome.split(' ')[0] ?? '');

  async entrar(email: string, senha: string): Promise<void> {
    this.definir(await firstValueFrom(this.http.post<Sessao>(`${this.api}/api/v1/auth/login`, { email, senha })));
  }

  /** Cadastro público; já entra logado. */
  async cadastrar(nome: string, email: string, senha: string): Promise<void> {
    this.definir(await firstValueFrom(this.http.post<Sessao>(`${this.api}/api/v1/auth/cadastro`, { nome, email, senha })));
  }

  sair(): void {
    this.sessao.set(null);
    try {
      localStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* armazenamento indisponível */
    }
    void this.router.navigateByUrl('/entrar');
  }

  private definir(sessao: Sessao): void {
    this.sessao.set(sessao);
    try {
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    } catch {
      // modo privado/armazenamento cheio: a sessão vale enquanto o app estiver aberto
    }
  }
}

function lerSessaoSalva(): Sessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    return bruto ? (JSON.parse(bruto) as Sessao) : null;
  } catch {
    return null;
  }
}
