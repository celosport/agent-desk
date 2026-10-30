/** Perfis = enum PerfilUsuario do SharedKernel (JSON em SNAKE_CASE_UPPER). Acrescente aqui os do seu domínio. */
export type Perfil = 'USUARIO' | 'ADMIN';

export interface UsuarioLogado {
  usuarioId: string;
  nome: string;
  email: string;
  perfil: Perfil;
}

/** = SessaoDto do módulo Contas (POST /api/v1/auth/login e /cadastro). */
export interface Sessao {
  accessToken: string;
  tokenType: 'Bearer';
  expiraEm: string;
  usuario: UsuarioLogado;
}
