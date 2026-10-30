import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { Tarefa } from '../../features/tarefas/data-access/tarefas.models';

/**
 * API falsa em memória para `npm run start:mock` e para os testes E2E: demonstração, design e testes sem backend.
 * Só é registrada quando environment.mockApi = true (nunca em produção).
 * Login: senha livre; e-mail com "admin" entra como ADMIN, qualquer outro como USUARIO.
 * Cada recarga da página volta aos dados de exemplo (testes isolados).
 *
 * Ao criar um endpoint novo na API, acrescente a resposta aqui (mesmo contrato JSON e mesmos `code` de erro).
 */
const USUARIOS = {
  usuario: { usuarioId: '11111111-1111-1111-1111-111111111111', nome: 'Maria Silva', email: 'maria@exemplo.com', perfil: 'USUARIO' },
  admin: { usuarioId: '99999999-9999-9999-9999-999999999999', nome: 'Admin do Sistema', email: 'admin@exemplo.com', perfil: 'ADMIN' },
} as const;

type Quem = keyof typeof USUARIOS;

const agora = Date.now();
let tarefas: Tarefa[] = [
  { tarefaId: 'a1', titulo: 'Ler o CLAUDE.md e as notas do Obsidian', status: 'PENDENTE', criadaEm: new Date(agora - 3_600_000).toISOString() },
  { tarefaId: 'a2', titulo: 'Responder as perguntas do novo projeto', status: 'PENDENTE', criadaEm: new Date(agora - 7_200_000).toISOString() },
  {
    tarefaId: 'a3',
    titulo: 'Subir a API e o app juntos (F5)',
    status: 'CONCLUIDA',
    criadaEm: new Date(agora - 86_400_000).toISOString(),
    concluidaEm: new Date(agora - 80_000_000).toISOString(),
  },
];

const sessao = (u: Quem) => ({
  accessToken: `token-mock-${u}`,
  tokenType: 'Bearer',
  expiraEm: new Date(Date.now() + 8 * 3_600_000).toISOString(),
  usuario: USUARIOS[u],
});

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const url = new URL(req.urlWithParams, 'http://mock');
  if (!url.pathname.startsWith('/api/')) return next(req);
  return responder(req, url).pipe(delay(150));
};

function ok(body: unknown, status = 200): Observable<HttpResponse<unknown>> {
  return of(new HttpResponse({ status, body }));
}

function erro(status: number, code: string, title: string, errors?: Record<string, string[]>): Observable<never> {
  return throwError(() => new HttpErrorResponse({ status, error: { status, code, title, errors } }));
}

function autenticado(req: HttpRequest<unknown>): boolean {
  return (req.headers.get('Authorization') ?? '').startsWith('Bearer token-mock-');
}

function responder(req: HttpRequest<unknown>, url: URL): Observable<HttpResponse<unknown>> {
  const c = url.pathname;
  const corpo = (req.body ?? {}) as Record<string, unknown>;

  // ---- Contas ----
  if (c === '/api/v1/auth/login' && req.method === 'POST') {
    const email = String(corpo['email'] ?? '').toLowerCase();
    if (!email || !corpo['senha']) return erro(400, 'Validacao', 'Dados inválidos.', { email: ['Informe e-mail e senha.'] });
    return ok(sessao(email.includes('admin') ? 'admin' : 'usuario'));
  }
  if (c === '/api/v1/auth/cadastro' && req.method === 'POST') {
    const email = String(corpo['email'] ?? '').toLowerCase();
    if (email.includes('maria')) return erro(409, 'Auth.EmailEmUso', 'Este e-mail já tem cadastro.');
    const s = sessao('usuario');
    return ok({ ...s, usuario: { ...s.usuario, nome: String(corpo['nome'] ?? ''), email } }, 201);
  }

  if (!autenticado(req)) return erro(401, 'Auth.NaoAutenticado', 'Entre novamente.');

  // ---- Tarefas (módulo de exemplo) ----
  if (c === '/api/v1/tarefas' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    return ok(status ? tarefas.filter((t) => t.status === status) : tarefas);
  }
  if (c === '/api/v1/tarefas' && req.method === 'POST') {
    const titulo = String(corpo['titulo'] ?? '').trim();
    if (!titulo) return erro(400, 'Validacao', 'Dados inválidos.', { titulo: ['Informe o título.'] });
    const nova: Tarefa = { tarefaId: crypto.randomUUID(), titulo, status: 'PENDENTE', criadaEm: new Date().toISOString() };
    tarefas = [nova, ...tarefas];
    return ok(nova, 201);
  }
  const concluir = c.match(/^\/api\/v1\/tarefas\/([^/]+)\/concluir$/);
  if (concluir && req.method === 'PUT') {
    const tarefa = tarefas.find((t) => t.tarefaId === concluir[1]);
    if (!tarefa) return erro(404, 'Tarefas.NaoEncontrada', 'Tarefa não encontrada.');
    if (tarefa.status === 'CONCLUIDA') return erro(409, 'Tarefas.JaConcluida', 'Esta tarefa já foi concluída.');
    const atualizada: Tarefa = { ...tarefa, status: 'CONCLUIDA', concluidaEm: new Date().toISOString() };
    tarefas = tarefas.map((t) => (t.tarefaId === atualizada.tarefaId ? atualizada : t));
    return ok(atualizada);
  }

  return erro(404, 'Mock.RotaNaoEncontrada', `Mock sem resposta para ${req.method} ${c}. Acrescente em core/mock.`);
}
