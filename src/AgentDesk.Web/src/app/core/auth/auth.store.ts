import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { Sessao, UsuarioLogado } from './auth.models';

export const CHAVE_SESSAO = 'agentdesk.sessao';
/** Sessão do ADMIN guardada enquanto ele olha o app como outro usuário ("Ver como"). */
export const CHAVE_SESSAO_ADMIN = 'agentdesk.sessao.admin';

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
  /** Nome do ADMIN quando o app está no modo "Ver como" (somente leitura); null no uso normal. */
  readonly verComoPor = computed(() => this.sessao()?.verComoPor ?? null);
  readonly primeiroNome = computed(() => this.usuario()?.nome.split(' ')[0] ?? '');

  /** Muda a cada edição do usuário: descarta respostas de perfil que ficaram para trás. */
  private versaoUsuario = 0;

  /** URL completa da foto de perfil (ou null). Aceita data: e http(s) como estão (mock e CDN). */
  readonly fotoSrc = computed(() => {
    const url = this.usuario()?.fotoUrl;
    return !url ? null : /^(data:|blob:|https?:)/.test(url) ? url : this.api + url;
  });

  /** Busca na API quem está logado (nome e foto). Sem rede, o app segue com o que está guardado no aparelho. */
  async carregarPerfil(): Promise<void> {
    if (!this.autenticado()) return;
    const versao = this.versaoUsuario;
    try {
      const usuario = await firstValueFrom(this.http.get<UsuarioLogado>(`${this.api}/api/v1/conta/perfil`));
      // Chegou depois de uma edição feita enquanto buscava: a resposta antiga não pode desfazer a edição
      if (versao === this.versaoUsuario) this.atualizarUsuario(usuario);
    } catch {
      /* offline ou sessão vencida: o interceptor trata o 401; aqui não há o que fazer */
    }
  }

  /** Troca os dados do usuário na sessão (depois de editar nome ou foto) e guarda no aparelho. */
  atualizarUsuario(usuario: UsuarioLogado): void {
    this.versaoUsuario++;
    const atual = this.sessao();
    if (atual) this.definir({ ...atual, usuario });
  }

  async entrar(email: string, senha: string): Promise<void> {
    this.definir(await firstValueFrom(this.http.post<Sessao>(`${this.api}/api/v1/auth/login`, { email, senha })));
  }

  /** Cadastro público; já entra logado. */
  async cadastrar(nome: string, email: string, senha: string): Promise<void> {
    this.definir(await firstValueFrom(this.http.post<Sessao>(`${this.api}/api/v1/auth/cadastro`, { nome, email, senha })));
  }

  /**
   * ADMIN: passa a ver o app como o usuário escolhido, só leitura (a API recusa qualquer alteração). A sessão do ADMIN fica guardada
   * para "Sair do modo" voltar sem pedir senha. [[ADR-020 - Ver Como (Admin em Somente Leitura)]]
   */
  async verComo(usuarioId: string): Promise<void> {
    const admin = this.sessao();
    const nova = await firstValueFrom(this.http.post<Sessao>(`${this.api}/api/v1/auth/ver-como`, { usuarioId }));
    if (admin && !admin.verComoPor) this.guardarAdmin(admin);
    this.definir(nova);
    await this.router.navigateByUrl('/inicio');
  }

  /** Volta para a sessão do ADMIN (ou, se ela não existe mais, para o login). */
  async sairDoVerComo(): Promise<void> {
    const admin = this.lerAdminGuardado();
    if (!admin || new Date(admin.expiraEm).getTime() <= Date.now()) {
      this.sair();
      return;
    }
    try {
      localStorage.removeItem(CHAVE_SESSAO_ADMIN);
    } catch {
      /* armazenamento indisponível */
    }
    this.definir(admin);
    await this.router.navigateByUrl('/configuracoes');
  }

  private guardarAdmin(admin: Sessao): void {
    try {
      localStorage.setItem(CHAVE_SESSAO_ADMIN, JSON.stringify(admin));
    } catch {
      /* sem armazenamento: ao sair do modo o ADMIN entra de novo */
    }
  }

  private lerAdminGuardado(): Sessao | null {
    try {
      const bruto = localStorage.getItem(CHAVE_SESSAO_ADMIN);
      return bruto ? (JSON.parse(bruto) as Sessao) : null;
    } catch {
      return null;
    }
  }

  sair(): void {
    this.sessao.set(null);
    try {
      localStorage.removeItem(CHAVE_SESSAO_ADMIN);
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
