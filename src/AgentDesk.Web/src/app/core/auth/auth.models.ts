/** Perfis = enum PerfilUsuario do SharedKernel (JSON em SNAKE_CASE_UPPER). Acrescente aqui os do seu domínio. */
export type Perfil = 'USUARIO' | 'ADMIN';

export interface UsuarioLogado {
  usuarioId: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Caminho relativo da API (com ?v=); use AuthStore.fotoSrc para a URL completa. Ausente = sem foto. */
  fotoUrl?: string;
}

/** = SessaoDto do módulo Contas (POST /api/v1/auth/login e /cadastro). */
export interface Sessao {
  accessToken: string;
  tokenType: 'Bearer';
  expiraEm: string;
  usuario: UsuarioLogado;
  /** Nome do ADMIN quando é o modo "Ver como" (somente leitura); ausente no login normal. */
  verComoPor?: string;
}
