import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { Configuracao, Modelo } from '../../features/configuracoes/data-access/configuracoes.models';
import { Automacao, Execucao } from '../../features/automacoes/data-access/automacoes.models';

/**
 * API falsa em memória para `npm run start:mock` e para os testes E2E: demonstração, design e testes sem backend.
 * Só é registrada quando environment.mockApi = true (nunca em produção).
 * Login: senha livre; e-mail com "admin" entra como ADMIN, qualquer outro como USUARIO.
 * Cada recarga da página volta aos dados de exemplo (testes isolados).
 *
 * Ao criar um endpoint novo na API, acrescente a resposta aqui (mesmo contrato JSON e mesmos `code` de erro).
 *
 * Automações: o resultado é um texto falso; "[recusar]" na entrada simula a recusa da Claude, e o custo de cada execução
 * conta para o limite mensal configurado (o mock guarda o gasto do mês na memória).
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

// ---- Configuracoes: modelos (mesma carga inicial do schema.sql) e a configuração do usuário ----
let modelos: Modelo[] = [
  modeloMock('claude-fable-5-1', 'Claude Fable 5.1', 10, 50, 0.25, 12.5, true),
  modeloMock('claude-opus-5-5', 'Claude Opus 5.5', 4, 20, 0.2, 5, true),
  modeloMock('claude-sonnet-5-5', 'Claude Sonnet 5.5', 2, 10, 0.2, 2.5, true),
  modeloMock('claude-haiku-5-5', 'Claude Haiku 5.5', 0.1, 0.5, 0.01, 0.125, false),
];
let configuracao: Configuracao = { chaveApiConfigurada: false, bloquearAoAtingirLimite: true };
/** Só existe no mock (a API real guarda cifrada no servidor): decide a resposta do "Testar chave". */
let chaveSalva: string | null = null;

// ---- Automacoes: a mesma carga inicial do schema.sql (prompts resumidos) ----
let automacoes: Automacao[] = [
  automacaoMock('a1e5c1a0-0000-4000-8000-000000000001', 'relatorio-executivo', 'Gerar Relatório Executivo',
    'Transforma anotações, dados ou um texto longo em um relatório executivo claro para a diretoria.', 'claude-opus-5-5', 8000),
  automacaoMock('a1e5c1a0-0000-4000-8000-000000000002', 'analisar-codigo', 'Analisar Código',
    'Revisa um trecho de código: bugs, segurança, legibilidade e sugestões de melhoria.', 'claude-opus-5-5', 8000),
  automacaoMock('a1e5c1a0-0000-4000-8000-000000000003', 'resumir-documento', 'Resumir Documento',
    'Resume um documento longo em tópicos, com as decisões e os números importantes.', 'claude-haiku-5-5', 4000),
];
/** Gasto do mês no mock (US$), para o limite mensal. */
let gastoMes = 0;

function automacaoMock(automacaoId: string, codigo: string, nome: string, descricao: string, modeloId: string, maxTokens: number): Automacao {
  return {
    automacaoId,
    codigo,
    nome,
    descricao,
    promptSistema: `Você é um assistente que ajuda com: ${nome}. Responda em português do Brasil, em Markdown.`,
    modeloMensagem: 'Material:\n\n{{entrada}}',
    modeloId,
    maxTokens,
    ativa: true,
  };
}

/** Mesmos tokens fixos do falso dos testes de integração (1000/500/200/100) e o custo pelo preço do modelo. */
function executarMock(automacao: Automacao, corpo: Record<string, unknown>): Observable<HttpResponse<unknown>> {
  const entrada = String(corpo['entrada'] ?? '');
  if (!entrada.trim()) return invalido({ entrada: ['Cole um texto ou envie um arquivo .txt/.md.'] });
  const arquivo = corpo['nomeArquivo'] ? String(corpo['nomeArquivo']) : null;
  if (arquivo && !/\.(txt|md)$/i.test(arquivo)) return invalido({ nomeArquivo: ['Só arquivos .txt ou .md.'] });
  if (!chaveSalva)
    return erro(422, 'Automacoes.ChaveNaoConfigurada', 'Cadastre a sua API key da Anthropic em Configurações para rodar as automações.');
  const modeloId = String(corpo['modeloId'] ?? '') || automacao.modeloId || configuracao.modeloPadraoId;
  if (!modeloId) return erro(422, 'Automacoes.ModeloNaoDefinido', 'Escolha um modelo (ou defina o seu modelo padrão em Configurações).');
  const modelo = modelos.find((m) => m.modeloId === modeloId && m.ativo);
  if (!modelo) return erro(422, 'Automacoes.ModeloInvalido', 'Este modelo não está ativo na tabela de modelos. Escolha outro.');
  const limite = configuracao.limiteMensalUsd;
  if (limite !== undefined && configuracao.bloquearAoAtingirLimite && gastoMes >= limite)
    return erro(422, 'Automacoes.LimiteMensalAtingido',
      `Você atingiu o limite de gasto do mês (US$ ${gastoMes.toFixed(2)} de US$ ${limite.toFixed(2)}). Aumente o limite em Configurações ou espere o próximo mês.`);
  if (entrada.includes('[recusar]'))
    return erro(422, 'Automacoes.Recusada', 'A Claude recusou este pedido (filtro de segurança). Os tokens usados foram registrados no consumo.');

  const uso = { entrada: 1000, saida: 500, cacheLeitura: 200, cacheEscrita: 100 };
  const custo =
    Math.round(
      (uso.entrada * modelo.precoEntradaMTok +
        uso.saida * modelo.precoSaidaMTok +
        uso.cacheLeitura * (modelo.precoCacheLeituraMTok ?? modelo.precoEntradaMTok) +
        uso.cacheEscrita * (modelo.precoCacheEscritaMTok ?? modelo.precoEntradaMTok)) / 1e6 * 1e6,
    ) / 1e6;
  gastoMes += custo;
  const percentual = limite ? Math.round((gastoMes / limite) * 1000) / 10 : 0;
  const execucao: Execucao = {
    chamadaId: crypto.randomUUID(),
    automacaoId: automacao.automacaoId,
    codigo: automacao.codigo,
    modeloId,
    modeloUsado: modeloId,
    resultado: `# ${automacao.nome}\n\nResultado de demonstração (modo mock) para:\n\n> ${entrada.slice(0, 80)}\n\n- Ponto 1\n- Ponto 2`,
    truncado: entrada.includes('[longo]'),
    tokens: { ...uso, total: 1800 },
    custoUsd: custo,
    duracaoMs: 1234,
    iniciadaEm: new Date().toISOString(),
    alertaLimite: limite && percentual >= 80
      ? { gastoMesUsd: gastoMes, limiteMensalUsd: limite, percentual, atingido: gastoMes >= limite }
      : undefined,
  };
  return ok(execucao).pipe(delay(400)); // a Claude demora: dá tempo de ver o "Executando…"
}

function modeloMock(
  modeloId: string,
  nomeExibicao: string,
  entrada: number,
  saida: number,
  leitura: number,
  escrita: number,
  fallbackRecusa: boolean,
): Modelo {
  return {
    modeloId,
    nomeExibicao,
    precoEntradaMTok: entrada,
    precoSaidaMTok: saida,
    precoCacheLeituraMTok: leitura,
    precoCacheEscritaMTok: escrita,
    ativo: true,
    fallbackRecusa,
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

function modeloDoCorpo(modeloId: string, corpo: Record<string, unknown>, ativo: boolean, fallbackAtual = false): Modelo {
  return {
    modeloId,
    nomeExibicao: String(corpo['nomeExibicao']).trim(),
    precoEntradaMTok: Number(corpo['precoEntradaMTok']),
    precoSaidaMTok: Number(corpo['precoSaidaMTok']),
    precoCacheLeituraMTok: opcional(corpo['precoCacheLeituraMTok']),
    precoCacheEscritaMTok: opcional(corpo['precoCacheEscritaMTok']),
    ativo,
    fallbackRecusa: typeof corpo['fallbackRecusa'] === 'boolean' ? corpo['fallbackRecusa'] : fallbackAtual,
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

  // ---- Automacoes ----
  if (c === '/api/v1/automacoes' && req.method === 'GET') return ok(ehAdmin(req) ? automacoes : automacoes.filter((a) => a.ativa));
  const executarAutomacao = c.match(/^\/api\/v1\/automacoes\/([^/]+)\/executar$/);
  if (executarAutomacao && req.method === 'POST') {
    const automacao = automacoes.find((a) => a.automacaoId === executarAutomacao[1] && a.ativa);
    if (!automacao) return erro(404, 'Automacoes.NaoEncontrada', 'Automação não encontrada.');
    return executarMock(automacao, corpo);
  }
  const editarAutomacao = c.match(/^\/api\/v1\/automacoes\/([^/]+)$/);
  if (editarAutomacao && req.method === 'PUT') {
    if (!ehAdmin(req)) return erro(403, 'Auth.SemPermissao', 'Acesso negado.');
    const atual = automacoes.find((a) => a.automacaoId === editarAutomacao[1]);
    if (!atual) return erro(404, 'Automacoes.NaoEncontrada', 'Automação não encontrada.');
    const mensagem = String(corpo['modeloMensagem'] ?? '');
    if (!mensagem.includes('{{entrada}}'))
      return invalido({ modeloMensagem: ['O modelo da mensagem precisa ter {{entrada}} onde entra o texto do usuário.'] });
    const atualizada: Automacao = {
      ...atual,
      nome: String(corpo['nome'] ?? '').trim(),
      descricao: String(corpo['descricao'] ?? '').trim(),
      promptSistema: String(corpo['promptSistema'] ?? '').trim(),
      modeloMensagem: mensagem.trim(),
      modeloId: corpo['modeloId'] ? String(corpo['modeloId']) : undefined,
      maxTokens: Number(corpo['maxTokens']),
      ativa: corpo['ativa'] !== false,
    };
    automacoes = automacoes.map((a) => (a.automacaoId === atual.automacaoId ? atualizada : a));
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
    const atualizado = modeloDoCorpo(id, corpo, typeof corpo['ativo'] === 'boolean' ? corpo['ativo'] : atual.ativo, atual.fallbackRecusa);
    modelos = modelos.map((m) => (m.modeloId === id ? atualizado : m));
    return ok(atualizado);
  }

  return erro(404, 'Mock.RotaNaoEncontrada', `Mock sem resposta para ${req.method} ${c}. Acrescente em core/mock.`);
}
