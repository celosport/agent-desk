import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { Configuracao, Modelo } from '../../features/configuracoes/data-access/configuracoes.models';
import { Tarefa } from '../../features/tarefas/data-access/tarefas.models';

/**
 * API falsa em memória para `npm run start:mock` e para os testes E2E: demonstração, design e testes sem backend.
 * Só é registrada quando environment.mockApi = true (nunca em produção).
 * Login: senha livre; e-mail com "admin" entra como ADMIN, qualquer outro como USUARIO.
 * Cada recarga da página volta aos dados de exemplo (testes isolados).
 *
 * Ao criar um endpoint novo na API, acrescente a resposta aqui (mesmo contrato JSON e mesmos `code` de erro).
 *
 * API key falsa (Configuracoes): qualquer "sk-ant-..." com 20+ caracteres é aceita; o teste da chave responde pelo final —
 * "...INVALIDA" = Anthropic.ChaveInvalida (422), "...FORA" = Anthropic.Indisponivel (503), outra = válida.
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

// ---- Configuracoes: modelos (mesma carga inicial do schema.sql) e a configuração do usuário ----
let modelos: Modelo[] = [
  modeloMock('claude-fable-5-1', 'Claude Fable 5.1', 10, 50, 0.25, 12.5),
  modeloMock('claude-opus-5-5', 'Claude Opus 5.5', 4, 20, 0.2, 5),
  modeloMock('claude-sonnet-5-5', 'Claude Sonnet 5.5', 2, 10, 0.2, 2.5),
  modeloMock('claude-haiku-5-5', 'Claude Haiku 5.5', 0.1, 0.5, 0.01, 0.125),
];
let configuracao: Configuracao = { chaveApiConfigurada: false, bloquearAoAtingirLimite: true };
/** Só existe no mock (a API real guarda cifrada no servidor): decide a resposta do "Testar chave". */
let chaveSalva: string | null = null;

function modeloMock(modeloId: string, nomeExibicao: string, entrada: number, saida: number, leitura: number, escrita: number): Modelo {
  return {
    modeloId,
    nomeExibicao,
    precoEntradaMTok: entrada,
    precoSaidaMTok: saida,
    precoCacheLeituraMTok: leitura,
    precoCacheEscritaMTok: escrita,
    ativo: true,
    atualizadoEm: new Date(agora - 86_400_000).toISOString(),
  };
}

/** Campo numérico opcional: vazio some do JSON (como na API, que omite nulos). */
function opcional(valor: unknown): number | undefined {
  return valor === null || valor === undefined || valor === '' ? undefined : Number(valor);
}

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

function ehAdmin(req: HttpRequest<unknown>): boolean {
  return req.headers.get('Authorization') === 'Bearer token-mock-admin';
}

function invalido(errors: Record<string, string[]>): Observable<never> {
  return erro(400, 'Validacao.Falhou', 'Um ou mais campos são inválidos.', errors);
}

/** Mesmas regras do validator da API para criar/editar modelo. Devolve os erros por campo. */
function validarModelo(corpo: Record<string, unknown>): Record<string, string[]> {
  const erros: Record<string, string[]> = {};
  if (!String(corpo['nomeExibicao'] ?? '').trim()) erros['nomeExibicao'] = ['Informe o nome de exibição.'];
  if (opcional(corpo['precoEntradaMTok']) === undefined) erros['precoEntradaMTok'] = ['Informe o preço de entrada.'];
  if (opcional(corpo['precoSaidaMTok']) === undefined) erros['precoSaidaMTok'] = ['Informe o preço de saída.'];
  for (const campo of ['precoEntradaMTok', 'precoSaidaMTok', 'precoCacheLeituraMTok', 'precoCacheEscritaMTok']) {
    if ((opcional(corpo[campo]) ?? 0) < 0) erros[campo] = ['O preço não pode ser negativo.'];
  }
  return erros;
}

function modeloDoCorpo(modeloId: string, corpo: Record<string, unknown>, ativo: boolean): Modelo {
  return {
    modeloId,
    nomeExibicao: String(corpo['nomeExibicao']).trim(),
    precoEntradaMTok: Number(corpo['precoEntradaMTok']),
    precoSaidaMTok: Number(corpo['precoSaidaMTok']),
    precoCacheLeituraMTok: opcional(corpo['precoCacheLeituraMTok']),
    precoCacheEscritaMTok: opcional(corpo['precoCacheEscritaMTok']),
    ativo,
    atualizadoEm: new Date().toISOString(),
  };
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

  // ---- Configuracoes ----
  if (c === '/api/v1/configuracoes' && req.method === 'GET') return ok(configuracao);
  if (c === '/api/v1/configuracoes/chave-api' && req.method === 'PUT') {
    const chave = String(corpo['chaveApi'] ?? '').trim();
    if (!chave) return invalido({ chaveApi: ['Cole a sua API key da Anthropic.'] });
    if (!chave.startsWith('sk-ant-')) return invalido({ chaveApi: ['A API key da Anthropic começa com "sk-ant-".'] });
    if (chave.length < 20) return invalido({ chaveApi: ['Esta chave não parece completa. Copie de novo no Console da Anthropic.'] });
    chaveSalva = chave;
    configuracao = { ...configuracao, chaveApiConfigurada: true, chaveApiMascarada: `sk-ant-...${chave.slice(-4)}` };
    return ok(configuracao);
  }
  if (c === '/api/v1/configuracoes/chave-api' && req.method === 'DELETE') {
    chaveSalva = null;
    configuracao = { ...configuracao, chaveApiConfigurada: false, chaveApiMascarada: undefined };
    return ok(configuracao);
  }
  if (c === '/api/v1/configuracoes/chave-api/testar' && req.method === 'POST') {
    if (!chaveSalva) return erro(422, 'Configuracoes.ChaveNaoConfigurada', 'Cadastre a sua API key da Anthropic antes de testar.');
    if (chaveSalva.endsWith('INVALIDA'))
      return erro(422, 'Anthropic.ChaveInvalida', 'A Anthropic recusou a chave. Confira se ela foi copiada inteira e se ainda está ativa.');
    if (chaveSalva.endsWith('FORA')) return erro(503, 'Anthropic.Indisponivel', 'A API da Anthropic não respondeu. Tente de novo em instantes.');
    return ok({ valida: true, testadaEm: new Date().toISOString() });
  }
  if (c === '/api/v1/configuracoes/preferencias' && req.method === 'PUT') {
    const modeloId = String(corpo['modeloPadraoId'] ?? '').trim() || undefined;
    const limite = opcional(corpo['limiteMensalUsd']);
    if (limite !== undefined && limite <= 0)
      return invalido({ limiteMensalUsd: ['O limite mensal precisa ser maior que zero (ou deixe em branco para não ter limite).'] });
    if (modeloId && !modelos.some((m) => m.modeloId === modeloId && m.ativo))
      return erro(422, 'Configuracoes.ModeloInvalido', 'Escolha um modelo ativo da tabela de modelos.');
    configuracao = {
      ...configuracao,
      modeloPadraoId: modeloId,
      limiteMensalUsd: limite,
      bloquearAoAtingirLimite: corpo['bloquearAoAtingirLimite'] !== false,
    };
    return ok(configuracao);
  }

  // ---- Modelos (todos leem; ADMIN cria e edita) ----
  if (c === '/api/v1/modelos' && req.method === 'GET') return ok(modelos);
  if (c === '/api/v1/modelos' && req.method === 'POST') {
    if (!ehAdmin(req)) return erro(403, 'Auth.SemPermissao', 'Acesso negado.');
    const modeloId = String(corpo['modeloId'] ?? '').trim();
    const erros = validarModelo(corpo);
    if (!/^[a-z0-9][a-z0-9.-]{1,79}$/.test(modeloId))
      erros['modeloId'] = ['Use o id da API: letras minúsculas, números, "-" e "." (ex.: claude-opus-5-5).'];
    if (Object.keys(erros).length) return invalido(erros);
    if (modelos.some((m) => m.modeloId === modeloId)) return erro(409, 'Modelos.JaExiste', 'Já existe um modelo com este id.');
    const novo = modeloDoCorpo(modeloId, corpo, true);
    modelos = [...modelos, novo];
    return ok(novo, 201);
  }
  const editarModelo = c.match(/^\/api\/v1\/modelos\/([^/]+)$/);
  if (editarModelo && req.method === 'PUT') {
    if (!ehAdmin(req)) return erro(403, 'Auth.SemPermissao', 'Acesso negado.');
    const id = decodeURIComponent(editarModelo[1]);
    const atual = modelos.find((m) => m.modeloId === id);
    if (!atual) return erro(404, 'Modelos.NaoEncontrado', 'Modelo não encontrado.');
    const erros = validarModelo(corpo);
    if (Object.keys(erros).length) return invalido(erros);
    const atualizado = modeloDoCorpo(id, corpo, typeof corpo['ativo'] === 'boolean' ? corpo['ativo'] : atual.ativo);
    modelos = modelos.map((m) => (m.modeloId === id ? atualizado : m));
    return ok(atualizado);
  }

  return erro(404, 'Mock.RotaNaoEncontrada', `Mock sem resposta para ${req.method} ${c}. Acrescente em core/mock.`);
}
