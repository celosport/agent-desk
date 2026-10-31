import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { Configuracao, Modelo } from '../../features/configuracoes/data-access/configuracoes.models';
import { Automacao, Execucao } from '../../features/automacoes/data-access/automacoes.models';
import { Chamada, StatusChamada } from '../../features/consumo/data-access/consumo.models';
import { Dicas, DiaClaudeCode, LimitesAssinatura, EventoLinha, ItemClaudeCode, LinhaDoTempo, PaginaHistoricoSessoes, PainelClaudeCode, SessaoHistorico, UsoClaudeCode } from '../../features/consumo/data-access/claude-code.models';
import { AgenteEquipe } from '../../features/escritorio/data-access/equipe.models';

/**
 * API falsa em memória para `npm run start:mock` e para os testes E2E: demonstração, design e testes sem backend.
 * Só é registrada quando environment.mockApi = true (nunca em produção).
 * Login: senha livre; e-mail com "admin" entra como ADMIN, qualquer outro como USUARIO.
 * Cada recarga da página volta aos dados de exemplo (testes isolados).
 *
 * Ao criar um endpoint novo na API, acrescente a resposta aqui (mesmo contrato JSON e mesmos `code` de erro).
 *
 * Automações: o resultado é um texto falso; "[recusar]" na entrada simula a recusa da Claude, e o custo de cada execução
 * conta para o limite mensal configurado.
 * Consumo: começa com chamadas de exemplo nos últimos 20 dias (nenhuma hoje) da Maria e de outra usuária (para o "Todos"
 * do ADMIN); as execuções da sessão entram por cima. Só as execuções da sessão contam para o limite mensal.
 *
 * Sessões do Claude Code: duas salas de demonstração ("app-mobile" e "api-pagamentos") com atividades que se revezam a cada
 * 4 s; uma sessão do app-mobile fica sempre "precisando de você". Tokens de ingestão ficam em memória.
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
/** Execuções em andamento (id enviado pelo app) que o botão Cancelar já interrompeu. */
const execucoesCanceladas = new Set<string>();

/** Nome e aparência dos agentes (módulo Equipe); começa vazio: tudo no padrão do Escritório. */
let equipe: AgenteEquipe[] = [];

let automacoes: Automacao[] = [
  automacaoMock('a1e5c1a0-0000-4000-8000-000000000001', 'relatorio-executivo', 'Gerar Relatório Executivo',
    'Transforma anotações, dados ou um texto longo em um relatório executivo claro para a diretoria.', 'claude-opus-5-5', 8000),
  automacaoMock('a1e5c1a0-0000-4000-8000-000000000002', 'analisar-codigo', 'Analisar Código',
    'Revisa um trecho de código: bugs, segurança, legibilidade e sugestões de melhoria.', 'claude-opus-5-5', 8000),
  automacaoMock('a1e5c1a0-0000-4000-8000-000000000003', 'resumir-documento', 'Resumir Documento',
    'Resume um documento longo em tópicos, com as decisões e os números importantes.', 'claude-haiku-5-5', 4000),
];
// ---- Sessões do Claude Code (ao vivo, demonstração) ----
interface TokenMock {
  tokenId: string;
  nome: string;
  prefixo: string;
  criadoEm: string;
  revogadoEm?: string;
}
let tokensIngestao: TokenMock[] = [];

const ROTEIROS: { projeto: string; chave: string; sessaoId: string; maquina: string; modelo: string; passos: [string, string][] }[] = [
  {
    projeto: 'app-mobile', chave: 'a0b1c2d3e4f5', sessaoId: 'demo-sessao-1', maquina: 'Notebook', modelo: 'claude-opus-5-5',
    passos: [['TRABALHANDO', '📖 Lendo api.ts'], ['TRABALHANDO', '✏️ Editando Profile.tsx'], ['TRABALHANDO', '💻 Rodando npm test'], ['OCIOSA', '✅ Terminou']],
  },
  {
    projeto: 'app-mobile', chave: 'a0b1c2d3e4f5', sessaoId: 'demo-sessao-2', maquina: 'Notebook', modelo: 'claude-sonnet-5-5',
    passos: [['ESPERANDO_VOCE', '✋ Precisa de você: aprovar permissão']],
  },
  {
    projeto: 'app-mobile', chave: 'a0b1c2d3e4f5', sessaoId: 'demo-sessao-3', maquina: 'Desktop', modelo: 'claude-opus-5-5',
    passos: [['TRABALHANDO', '🔎 Procurando “SortMenu”'], ['TRABALHANDO', '👥 Chamando subagente Explore'], ['TRABALHANDO', '💭 Pensando…']],
  },
  {
    projeto: 'api-pagamentos', chave: 'f5e4d3c2b1a0', sessaoId: 'demo-sessao-4', maquina: 'Desktop', modelo: 'claude-haiku-5-5',
    passos: [['TRABALHANDO', '💻 Rodando dotnet test'], ['OCIOSA', '⏳ Esperando o seu próximo pedido']],
  },
];

function aoVivoMock() {
  const passo = Math.floor((Date.now() - agora) / 4000);
  const sessoes = ROTEIROS.map((r, i) => {
    const [status, atividade] = r.passos[(passo + i) % r.passos.length];
    const pedidos = 12 + passo * (i + 1);
    return {
      projeto: r.projeto,
      chave: r.chave,
      sessao: {
        sessaoId: r.sessaoId,
        maquina: r.maquina,
        status,
        atividade,
        modelo: r.modelo,
        tokens: pedidos * 41_000,
        tokensCacheLeitura: pedidos * 36_000,
        custoUsd: Math.round(pedidos * (r.modelo.includes('haiku') ? 0.004 : 0.09) * 1e4) / 1e4,
        pedidos,
        iniciadaEm: new Date(agora - (i + 1) * 1_800_000).toISOString(),
        ultimaAtividadeEm: new Date(Date.now() - 5000).toISOString(),
      },
    };
  });
  const projetos = [...new Set(sessoes.map((s) => s.chave))].map((chave) => {
    const daSala = sessoes.filter((s) => s.chave === chave);
    return { chave, nome: daSala[0].projeto, sessoes: daSala.map((s) => s.sessao) };
  });
  return { projetos, atualizadoEm: new Date().toISOString() };
}

// ---- Consumo ----
interface ChamadaMock extends Omit<Chamada, 'finalizadaEm'> {
  usuarioId: string;
  resultado?: string;
  precoEntradaMTok?: number;
  precoSaidaMTok?: number;
  /** Exemplo do mock: não conta para o limite mensal (só o que rodar na sessão conta). */
  exemplo?: boolean;
}

const OUTRA_USUARIA = { usuarioId: '22222222-2222-2222-2222-222222222222', nome: 'Joana Prado' };
let chamadas: ChamadaMock[] = chamadasDeExemplo();

function chamadasDeExemplo(): ChamadaMock[] {
  const fluxos = [
    { id: 'a1e5c1a0-0000-4000-8000-000000000001', nome: 'Gerar Relatório Executivo', modelo: 'claude-opus-5-5', custo: 0.0312 },
    { id: 'a1e5c1a0-0000-4000-8000-000000000002', nome: 'Analisar Código', modelo: 'claude-opus-5-5', custo: 0.0451 },
    { id: 'a1e5c1a0-0000-4000-8000-000000000003', nome: 'Resumir Documento', modelo: 'claude-haiku-5-5', custo: 0.0009 },
  ];
  const lista: ChamadaMock[] = [];
  for (let i = 0; i < 18; i++) {
    const f = fluxos[i % 3];
    const dono = i % 6 === 5 ? OUTRA_USUARIA.usuarioId : USUARIOS.usuario.usuarioId;
    const status: StatusChamada = i === 7 ? 'ERRO' : i === 11 ? 'RECUSADA' : 'SUCESSO';
    const entrada = 1200 + i * 137;
    const saida = status === 'SUCESSO' ? 600 + i * 41 : 0;
    lista.push({
      chamadaId: `c0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      usuarioId: dono,
      usuarioNome: dono === OUTRA_USUARIA.usuarioId ? OUTRA_USUARIA.nome : USUARIOS.usuario.nome,
      iniciadaEm: new Date(agora - (1 + Math.floor(i * 1.1)) * 86_400_000 - i * 3_600_000).toISOString(),
      automacaoId: f.id,
      automacaoNome: f.nome,
      modeloId: f.modelo,
      modeloUsado: f.modelo,
      tokens: { entrada, saida, cacheLeitura: 0, cacheEscrita: 0, total: entrada + saida },
      custoUsd: status === 'ERRO' ? 0 : Math.round(f.custo * (1 + (i % 4) / 3) * 1e6) / 1e6,
      duracaoMs: 2000 + i * 310,
      status,
      erroCodigo: status === 'ERRO' ? 'Anthropic.Indisponivel' : status === 'RECUSADA' ? 'Automacoes.Recusada' : undefined,
      temResultado: status === 'SUCESSO',
      resultado: status === 'SUCESSO' ? `# ${f.nome}\n\nResultado de exemplo nº ${i + 1} (modo mock).` : undefined,
      precoEntradaMTok: f.modelo === 'claude-opus-5-5' ? 4 : 0.1,
      precoSaidaMTok: f.modelo === 'claude-opus-5-5' ? 20 : 0.5,
      exemplo: true,
    });
  }
  return lista;
}

/** "2026-10-30" no fuso de Brasília. */
function diaLocal(iso: string | number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function quem(req: HttpRequest<unknown>): (typeof USUARIOS)[Quem] {
  return ehAdmin(req) ? USUARIOS.admin : USUARIOS.usuario;
}

/** Gasto do mês do usuário com o que rodou nesta sessão (os exemplos não contam). */
function gastoDoMes(usuarioId: string): number {
  const mes = diaLocal(Date.now()).slice(0, 7);
  return chamadas
    .filter((c) => c.usuarioId === usuarioId && !c.exemplo && diaLocal(c.iniciadaEm).startsWith(mes))
    .reduce((s, c) => s + c.custoUsd, 0);
}

function totais(lista: ChamadaMock[]) {
  return {
    chamadas: lista.length,
    tokens: lista.reduce((s, c) => s + c.tokens.total, 0),
    custoUsd: Math.round(lista.reduce((s, c) => s + c.custoUsd, 0) * 1e6) / 1e6,
  };
}

/** Sem o campo interno nem o resultado (o resultado só vem no detalhe); nome só no escopo TODOS. */
function chamadaPublica(c: ChamadaMock, comNome: boolean): Chamada {
  const { usuarioId: _u, resultado: _r, precoEntradaMTok: _pe, precoSaidaMTok: _ps, exemplo: _e, usuarioNome, ...resto } = c;
  const finalizadaEm = new Date(Date.parse(c.iniciadaEm) + c.duracaoMs).toISOString();
  return comNome ? { ...resto, usuarioNome, finalizadaEm } : { ...resto, finalizadaEm };
}

function consumoDoEscopo(req: HttpRequest<unknown>, url: URL): ChamadaMock[] | Observable<never> {
  const todos = url.searchParams.get('escopo') === 'TODOS';
  if (todos && !ehAdmin(req)) return erro(403, 'Consumo.SemPermissao', 'Só administradores veem o consumo de todos.');
  return todos ? chamadas : chamadas.filter((c) => c.usuarioId === quem(req).usuarioId);
}

function responderConsumo(req: HttpRequest<unknown>, url: URL, c: string): Observable<HttpResponse<unknown>> | null {
  if (c === '/api/v1/consumo/resumo' && req.method === 'GET') {
    const lista = consumoDoEscopo(req, url);
    if (!Array.isArray(lista)) return lista;
    const todos = url.searchParams.get('escopo') === 'TODOS';
    const dias = Math.min(90, Math.max(7, Number(url.searchParams.get('dias') ?? 30)));
    const hoje = diaLocal(Date.now());
    const serie = Array.from({ length: dias }, (_, i) => diaLocal(Date.now() - (dias - 1 - i) * 86_400_000));
    const naJanela = lista.filter((x) => diaLocal(x.iniciadaEm) >= serie[0]);
    const ranking = new Map<string, ChamadaMock[]>();
    for (const x of naJanela) ranking.set(x.automacaoId ?? '', [...(ranking.get(x.automacaoId ?? '') ?? []), x]);
    const mes = totais(lista.filter((x) => diaLocal(x.iniciadaEm).startsWith(hoje.slice(0, 7))));
    const limite = todos ? undefined : configuracao.limiteMensalUsd;
    return ok({
      escopo: todos ? 'TODOS' : 'MEU',
      hoje: totais(lista.filter((x) => diaLocal(x.iniciadaEm) === hoje)),
      mes,
      acumulado: totais(lista),
      dias,
      porDia: serie.map((dia) => ({ dia, ...totais(lista.filter((x) => diaLocal(x.iniciadaEm) === dia)) })),
      ranking: [...ranking.values()]
        .map((grupo) => ({ automacaoId: grupo[0].automacaoId, nome: grupo[0].automacaoNome ?? 'Sem automação', ...totais(grupo) }))
        .sort((a, b) => b.custoUsd - a.custoUsd),
      limiteMensalUsd: limite,
      percentualLimite: limite ? Math.round((mes.custoUsd / limite) * 1000) / 10 : undefined,
      atualizadoEm: new Date().toISOString(),
    });
  }
  if (c === '/api/v1/consumo/chamadas' && req.method === 'GET') {
    const lista = consumoDoEscopo(req, url);
    if (!Array.isArray(lista)) return lista;
    const p = url.searchParams;
    const de = p.get('de');
    const ate = p.get('ate');
    if (de && ate && de > ate) return invalido({ de: ['A data inicial precisa ser anterior ou igual à final.'] });
    const filtradas = lista
      .filter((x) => (!de || diaLocal(x.iniciadaEm) >= de) && (!ate || diaLocal(x.iniciadaEm) <= ate))
      .filter((x) => !p.get('automacaoId') || x.automacaoId === p.get('automacaoId'))
      .filter((x) => !p.get('modeloId') || x.modeloId === p.get('modeloId') || x.modeloUsado === p.get('modeloId'))
      .filter((x) => !p.get('status') || x.status === p.get('status'))
      .sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm));
    const tamanho = Math.min(100, Math.max(1, Number(p.get('tamanho') ?? 20)));
    const pagina = Math.max(1, Number(p.get('pagina') ?? 1));
    const todos = p.get('escopo') === 'TODOS';
    return ok({
      itens: filtradas.slice((pagina - 1) * tamanho, pagina * tamanho).map((x) => chamadaPublica(x, todos)),
      total: filtradas.length,
      pagina,
      tamanho,
      totais: totais(filtradas),
    });
  }
  const detalhe = c.match(/^\/api\/v1\/consumo\/chamadas\/([^/]+)$/);
  if (detalhe && req.method === 'GET') {
    const x = chamadas.find((y) => y.chamadaId === detalhe[1] && (ehAdmin(req) || y.usuarioId === quem(req).usuarioId));
    if (!x) return erro(404, 'Consumo.ChamadaNaoEncontrada', 'Chamada não encontrada.');
    return ok({
      chamada: chamadaPublica(x, ehAdmin(req)),
      resultado: x.resultado,
      precoEntradaMTok: x.precoEntradaMTok,
      precoSaidaMTok: x.precoSaidaMTok,
    });
  }
  if (c === '/api/v1/consumo/filtros' && req.method === 'GET') {
    const lista = consumoDoEscopo(req, url);
    if (!Array.isArray(lista)) return lista;
    const automacoesUsadas = new Map(lista.filter((x) => x.automacaoId).map((x) => [x.automacaoId!, x.automacaoNome ?? '']));
    return ok({
      automacoes: [...automacoesUsadas].map(([automacaoId, nome]) => ({ automacaoId, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      modelos: [...new Set(lista.flatMap((x) => [x.modeloId, x.modeloUsado ?? x.modeloId]))].sort(),
    });
  }
  return null;
}

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
function executarMock(automacao: Automacao, corpo: Record<string, unknown>, req: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
  const usuario = quem(req);
  const gastoMes = gastoDoMes(usuario.usuarioId);
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
  if (entrada.includes('[recusar]')) {
    chamadas = [registroMock(automacao, usuario, modeloId, { entrada: 1000, saida: 0, cacheLeitura: 0, cacheEscrita: 0 },
      (1000 * modelo.precoEntradaMTok) / 1e6, 'RECUSADA', modelo.precoEntradaMTok, modelo.precoSaidaMTok), ...chamadas];
    return erro(422, 'Automacoes.Recusada', 'A Claude recusou este pedido (filtro de segurança). Os tokens usados foram registrados no consumo.');
  }

  const uso = { entrada: 1000, saida: 500, cacheLeitura: 200, cacheEscrita: 100 };
  const custo =
    Math.round(
      (uso.entrada * modelo.precoEntradaMTok +
        uso.saida * modelo.precoSaidaMTok +
        uso.cacheLeitura * (modelo.precoCacheLeituraMTok ?? modelo.precoEntradaMTok) +
        uso.cacheEscrita * (modelo.precoCacheEscritaMTok ?? modelo.precoEntradaMTok)) / 1e6 * 1e6,
    ) / 1e6;
  const gastoDepois = gastoMes + custo;
  const percentual = limite ? Math.round((gastoDepois / limite) * 1000) / 10 : 0;
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
      ? { gastoMesUsd: gastoDepois, limiteMensalUsd: limite, percentual, atingido: gastoDepois >= limite }
      : undefined,
  };
  const registro = registroMock(automacao, usuario, modeloId, uso, custo, 'SUCESSO', modelo.precoEntradaMTok, modelo.precoSaidaMTok);
  chamadas = [{ ...registro, chamadaId: execucao.chamadaId, iniciadaEm: execucao.iniciadaEm, resultado: execucao.resultado, temResultado: true }, ...chamadas];
  const finalizadaEm = new Date(new Date(execucao.iniciadaEm).getTime() + execucao.duracaoMs).toISOString();
  const resposta = ok({ ...execucao, finalizadaEm });
  const execucaoId = String(corpo['execucaoId'] ?? '');
  if (!entrada.includes('[lento]')) return resposta.pipe(delay(400)); // a Claude demora: dá tempo de ver o "Executando…"

  // "[lento]": espera até 8 s e responde a um Cancelar (o mesmo que a API faz ao cancelar a chamada à Claude)
  chamadas = chamadas.filter((x) => x.chamadaId !== execucao.chamadaId);
  return new Observable<HttpResponse<unknown>>((assinante) => {
    const inicio = Date.now();
    const timer = setInterval(() => {
      if (execucoesCanceladas.delete(execucaoId)) {
        clearInterval(timer);
        const cancelada = registroMock(automacao, usuario, modeloId, { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 }, 0, 'CANCELADA',
          modelo.precoEntradaMTok, modelo.precoSaidaMTok);
        chamadas = [{ ...cancelada, duracaoMs: Date.now() - inicio, erroCodigo: 'Automacoes.Cancelada' }, ...chamadas];
        assinante.error(new HttpErrorResponse({ status: 422, error: { code: 'Automacoes.Cancelada', title: 'Execução cancelada.' } }));
      } else if (Date.now() - inicio >= 8000) {
        clearInterval(timer);
        chamadas = [{ ...registro, chamadaId: execucao.chamadaId, iniciadaEm: execucao.iniciadaEm, resultado: execucao.resultado, temResultado: true }, ...chamadas];
        assinante.next(new HttpResponse({ status: 200, body: { ...execucao, finalizadaEm } }));
        assinante.complete();
      }
    }, 100);
    return () => clearInterval(timer);
  });
}

function registroMock(
  automacao: Automacao,
  usuario: (typeof USUARIOS)[Quem],
  modeloId: string,
  uso: { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number },
  custo: number,
  status: StatusChamada,
  precoEntradaMTok: number,
  precoSaidaMTok: number,
): ChamadaMock {
  return {
    chamadaId: crypto.randomUUID(),
    usuarioId: usuario.usuarioId,
    usuarioNome: usuario.nome,
    iniciadaEm: new Date().toISOString(),
    automacaoId: automacao.automacaoId,
    automacaoNome: automacao.nome,
    modeloId,
    modeloUsado: modeloId,
    tokens: { ...uso, total: uso.entrada + uso.saida + uso.cacheLeitura + uso.cacheEscrita },
    custoUsd: Math.round(custo * 1e6) / 1e6,
    duracaoMs: 1234,
    status,
    erroCodigo: status === 'RECUSADA' ? 'Automacoes.Recusada' : undefined,
    temResultado: false,
    precoEntradaMTok,
    precoSaidaMTok,
  };
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
/** Uso do Claude Code de demonstração (mesma regra da API: cache baixo = abaixo de 60% com 5+ pedidos). */
function usoMock(pedidos: number, entrada: number, saida: number, cacheLeitura: number, cacheEscrita: number, custoUsd: number, vezes = 1): UsoClaudeCode {
  const [e, s, cl, ce] = [entrada, saida, cacheLeitura, cacheEscrita].map((v) => v * vezes);
  const contexto = e + cl + ce;
  const taxaCache = contexto === 0 ? undefined : Math.round((cl / contexto) * 1000) / 1000;
  const p = pedidos * vezes;
  return { pedidos: p, tokens: e + s + cl + ce, entrada: e, saida: s, cacheLeitura: cl, cacheEscrita: ce, custoUsd: Math.round(custoUsd * vezes * 1e6) / 1e6,
    taxaCache, cacheBaixo: p >= 5 && taxaCache !== undefined && taxaCache < 0.6 };
}

function painelClaudeCodeMock(todos: boolean): PainelClaudeCode {
  const k = todos ? 2 : 1;
  const hoje = new Date();
  const serie: DiaClaudeCode[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(hoje.getTime() - (29 - i) * 86_400_000);
    const dia = d.toISOString().slice(0, 10);
    const ativo = i % 4 !== 3; // alguns dias sem uso
    // Todo dia múltiplo de 5 tem cache baixo, para a lista "cache por dia" mostrar o destaque
    const baixo = i % 5 === 0;
    return { dia, uso: ativo ? usoMock(12 + i, 4000, 1500, baixo ? 3000 : 40_000, 2000, 0.4 + (i % 7) * 0.15, k) : usoMock(0, 0, 0, 0, 0, 0) };
  });
  const item = (nome: string, uso: UsoClaudeCode): ItemClaudeCode => ({ nome, uso });
  return {
    escopo: todos ? 'TODOS' : 'MEU',
    hoje: serie[29].uso,
    mes: usoMock(210, 90_000, 30_000, 900_000, 40_000, 48.2, k),
    acumulado: usoMock(640, 300_000, 100_000, 3_000_000, 120_000, 151.6, k),
    dias: 30,
    serie,
    projetos: [
      item('app-mobile', usoMock(120, 70_000, 20_000, 40_000, 30_000, 31.4, k)),
      item('api-pagamentos', usoMock(90, 20_000, 10_000, 860_000, 10_000, 16.8, k)),
    ],
    modelos: [
      item('claude-opus-5-5', usoMock(140, 60_000, 25_000, 700_000, 30_000, 39.9, k)),
      item('claude-sonnet-5-5', usoMock(70, 30_000, 5_000, 200_000, 10_000, 8.3, k)),
    ],
    ferramentas: [{ ferramenta: 'Read', usos: 420 * k }, { ferramenta: 'Edit', usos: 260 * k }, { ferramenta: 'Bash', usos: 180 * k }, { ferramenta: 'Grep', usos: 75 * k }],
    atualizadoEm: new Date().toISOString(),
  };
}

const DICAS_MOCK: Dicas = {
  dias: 7,
  economiaTotalUsd: 13.2,
  dicas: [
    { regra: 'CACHE_BAIXO', titulo: 'Cache baixo numa sessão longa', projeto: 'app-mobile', sessaoId: 'demo-sessao-1', economiaUsd: 8.4,
      texto: 'A sessão app-mobile (demo-ses) reaproveitou só 29% do contexto em 120 pedidos. Mantenha o início da conversa estável.' },
    { regra: 'MODELO_CARO', titulo: 'Modelo caro em sessão simples', projeto: 'api-pagamentos', sessaoId: 'demo-sessao-4', economiaUsd: 3.6,
      texto: 'A sessão api-pagamentos usou claude-opus-5-5 com só 1 edição de arquivo em 14 pedidos. Experimente o Sonnet.' },
    { regra: 'DIA_FORA_DA_CURVA', titulo: 'Dia fora da curva', economiaUsd: 1.2,
      texto: 'Em 29/10 o uso custou ≈ US$ 4,10, mais de 2× a média dos outros dias (≈ US$ 1,30).' },
  ],
};

/** 25 sessões de demonstração nos últimos 40 dias (2 páginas de 20), de dois projetos; a mais nova tem linha do tempo. */
function historicoSessoesMock(todos: boolean): SessaoHistorico[] {
  const agora = Date.now();
  return Array.from({ length: 25 }, (_, i) => {
    const projeto = i % 3 === 0 ? { nome: 'api-pagamentos', chave: 'f5e4d3c2b1a0' } : { nome: 'app-mobile', chave: 'a0b1c2d3e4f5' };
    const inicio = agora - i * 36 * 3_600_000 - 2 * 3_600_000;
    const duracaoMs = (20 + i * 3) * 60_000;
    const uso = usoMock(10 + i, 3000, 1000, i % 4 === 0 ? 2000 : 30_000, 1500, 0.5 + i * 0.1);
    return {
      sessaoId: `sess-${String(i).padStart(2, '0')}-${projeto.chave.slice(0, 4)}`,
      usuarioId: todos && i % 2 ? USUARIOS.admin.usuarioId : USUARIOS.usuario.usuarioId,
      usuarioNome: todos ? (i % 2 ? USUARIOS.admin.nome : USUARIOS.usuario.nome) : undefined,
      maquina: 'Notebook', projeto: projeto.nome, projetoChave: projeto.chave, modelo: i % 2 ? 'claude-sonnet-5-5' : 'claude-opus-5-5',
      status: i === 0 ? 'OCIOSA' : 'ENCERRADA', uso,
      iniciadaEm: new Date(inicio).toISOString(), ultimaAtividadeEm: new Date(inicio + duracaoMs).toISOString(),
      encerradaEm: i === 0 ? undefined : new Date(inicio + duracaoMs).toISOString(), duracaoMs,
    };
  });
}

function linhaDoTempoMock(sessao: SessaoHistorico): LinhaDoTempo {
  const t0 = Date.parse(sessao.iniciadaEm);
  const e = (min: number, tipo: string, extra: Partial<EventoLinha> = {}): EventoLinha => ({ ocorridoEm: new Date(t0 + min * 60_000).toISOString(), tipo, ...extra });
  return {
    sessao,
    cortada: false,
    eventos: [
      e(0, 'SessionStart'), e(1, 'UserPromptSubmit'), e(1.2, 'PreToolUse', { ferramenta: 'Read', resumo: 'api.ts' }),
      e(1.3, 'PostToolUse', { ferramenta: 'Read' }), e(2, 'api_request', { modelo: 'claude-opus-5-5', tokens: 12_400, custoUsd: 0.21 }),
      e(3, 'PreToolUse', { ferramenta: 'Edit', resumo: 'api.ts' }), e(62, 'PreToolUse', { ferramenta: 'Bash', resumo: 'npm test' }),
      e(63, 'PreCompact'), e(64, 'Stop'),
    ],
  };
}

function validarAgente(corpo: Record<string, unknown>): Record<string, string[]> {
  const erros: Record<string, string[]> = {};
  const cor = /^#[0-9a-fA-F]{6}$/;
  if (!['AUTOMACAO', 'PROJETO'].includes(String(corpo['alvo']).toUpperCase())) erros['alvo'] = ['Alvo inválido: use AUTOMACAO ou PROJETO.'];
  if (!String(corpo['chave'] ?? '').trim()) erros['chave'] = ['Informe a chave do agente.'];
  if (!String(corpo['nome'] ?? '').trim()) erros['nome'] = ['Dê um nome ao agente.'];
  else if (String(corpo['nome']).trim().length > 20) erros['nome'] = ['O nome tem no máximo 20 caracteres.'];
  for (const campo of ['corCabeca', 'corCorpo', 'corDetalhe', 'corOlhos']) {
    if (!cor.test(String(corpo[campo] ?? ''))) erros[campo] = ['Cor inválida: use o formato #rrggbb.'];
  }
  return erros;
}

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
  const cancelarExecucao = c.match(/^\/api\/v1\/automacoes\/execucoes\/([^/]+)\/cancelar$/);
  if (cancelarExecucao && req.method === 'POST') {
    // Só existe execução cancelável enquanto uma "[lento]" aguarda; o mock marca e a espera acima responde
    execucoesCanceladas.add(cancelarExecucao[1]);
    return ok(null, 204);
  }
  const executarAutomacao = c.match(/^\/api\/v1\/automacoes\/([^/]+)\/executar$/);
  if (executarAutomacao && req.method === 'POST') {
    const automacao = automacoes.find((a) => a.automacaoId === executarAutomacao[1] && a.ativa);
    if (!automacao) return erro(404, 'Automacoes.NaoEncontrada', 'Automação não encontrada.');
    return executarMock(automacao, corpo, req);
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

  // ---- Equipe (nome e aparência dos agentes) ----
  if (c === '/api/v1/equipe' && req.method === 'GET') return ok(equipe);
  if (c === '/api/v1/equipe' && req.method === 'PUT') {
    const erros = validarAgente(corpo);
    if (Object.keys(erros).length) return invalido(erros);
    const agente: AgenteEquipe = {
      alvo: String(corpo['alvo']).toUpperCase() as AgenteEquipe['alvo'],
      chave: String(corpo['chave']).trim(),
      ordem: Number(corpo['ordem'] ?? 0),
      nome: String(corpo['nome']).trim(),
      corCabeca: String(corpo['corCabeca']).toLowerCase(),
      corCorpo: String(corpo['corCorpo']).toLowerCase(),
      corDetalhe: String(corpo['corDetalhe']).toLowerCase(),
      corOlhos: String(corpo['corOlhos']).toLowerCase(),
      acessorio: (corpo['acessorio'] ?? 'NENHUM') as AgenteEquipe['acessorio'],
      antena: (corpo['antena'] ?? 'RETA') as AgenteEquipe['antena'],
      expressao: (corpo['expressao'] ?? 'NORMAL') as AgenteEquipe['expressao'],
      atualizadoEm: new Date().toISOString(),
    };
    equipe = [...equipe.filter((x) => !(x.alvo === agente.alvo && x.chave === agente.chave && x.ordem === agente.ordem)), agente];
    return ok(agente);
  }
  const restaurarAgente = c.match(/^\/api\/v1\/equipe\/([^/]+)\/(\d+)$/);
  if (restaurarAgente && req.method === 'DELETE') {
    const [alvo, ordem, chave] = [restaurarAgente[1].toUpperCase(), Number(restaurarAgente[2]), url.searchParams.get('chave') ?? ''];
    const existe = equipe.some((x) => x.alvo === alvo && x.chave === chave && x.ordem === ordem);
    if (!existe) return erro(404, 'Equipe.AgenteNaoEncontrado', 'Agente personalizado não encontrado.');
    equipe = equipe.filter((x) => !(x.alvo === alvo && x.chave === chave && x.ordem === ordem));
    return ok(null, 204);
  }

  // ---- Sessões do Claude Code ----
  if (c === '/api/v1/sessoes/ao-vivo' && req.method === 'GET') return ok(aoVivoMock());
  if (c === '/api/v1/sessoes/limites' && req.method === 'GET') {
    // 5 h renova daqui a 2 h 10 min e a semana daqui a 4 dias; "admin" não tem leitura (ex.: plano sem janelas)
    const limites: LimitesAssinatura = ehAdmin(req)
      ? {}
      : { cincoHoras: { percentual: 34.2, renovaEm: new Date(Date.now() + 130 * 60_000).toISOString() },
          semana: { percentual: 92, renovaEm: new Date(Date.now() + 4 * 86_400_000).toISOString() }, atualizadoEm: new Date().toISOString() };
    return ok(limites);
  }
  if (c === '/api/v1/sessoes/dicas' && req.method === 'GET') {
    const todos = url.searchParams.get('escopo') === 'TODOS';
    if (todos && !ehAdmin(req)) return erro(403, 'Sessoes.SemPermissao', 'Só o administrador vê as sessões de todos os usuários.');
    return ok(DICAS_MOCK);
  }
  if (c === '/api/v1/sessoes/historico' && req.method === 'GET') {
    const todos = url.searchParams.get('escopo') === 'TODOS';
    if (todos && !ehAdmin(req)) return erro(403, 'Sessoes.SemPermissao', 'Só o administrador vê as sessões de todos os usuários.');
    const projeto = url.searchParams.get('projeto');
    const [de, ate] = [url.searchParams.get('de'), url.searchParams.get('ate')];
    const tamanho = Number(url.searchParams.get('tamanho') ?? 20) || 20;
    const pagina = Math.max(1, Number(url.searchParams.get('pagina') ?? 1));
    const todas = historicoSessoesMock(todos);
    const filtradas = todas.filter((s) => (!projeto || s.projetoChave === projeto) && (!de || s.iniciadaEm.slice(0, 10) >= de) && (!ate || s.iniciadaEm.slice(0, 10) <= ate));
    const corpo: PaginaHistoricoSessoes = {
      itens: filtradas.slice((pagina - 1) * tamanho, pagina * tamanho), total: filtradas.length, pagina, tamanho,
      projetos: [{ chave: 'f5e4d3c2b1a0', nome: 'api-pagamentos' }, { chave: 'a0b1c2d3e4f5', nome: 'app-mobile' }],
    };
    return ok(corpo);
  }
  const linhaDoTempo = c.match(/^\/api\/v1\/sessoes\/historico\/([^/]+)$/);
  if (linhaDoTempo && req.method === 'GET') {
    const todos = url.searchParams.get('escopo') === 'TODOS';
    if (todos && !ehAdmin(req)) return erro(403, 'Sessoes.SemPermissao', 'Só o administrador vê as sessões de todos os usuários.');
    const sessao = historicoSessoesMock(todos).find((s) => s.sessaoId === decodeURIComponent(linhaDoTempo[1]));
    return sessao ? ok(linhaDoTempoMock(sessao)) : erro(404, 'Sessoes.NaoEncontrada', 'Sessão não encontrada.');
  }
  if (c === '/api/v1/sessoes/painel' && req.method === 'GET') {
    const todos = url.searchParams.get('escopo') === 'TODOS';
    if (todos && !ehAdmin(req)) return erro(403, 'Sessoes.SemPermissao', 'Só o administrador vê as sessões de todos os usuários.');
    return ok(painelClaudeCodeMock(todos));
  }
  if (c === '/api/v1/sessoes/tokens' && req.method === 'GET') return ok(tokensIngestao);
  if (c === '/api/v1/sessoes/tokens' && req.method === 'POST') {
    const nome = String(corpo['nome'] ?? '').trim();
    if (!nome) return invalido({ nome: ['Dê um nome para reconhecer a máquina (ex.: Notebook do trabalho).'] });
    if (tokensIngestao.filter((t) => !t.revogadoEm).length >= 10)
      return erro(409, 'Sessoes.LimiteDeTokens', 'Você já tem 10 tokens ativos. Revogue um que não use mais.');
    const segredo = `adk_mock${crypto.randomUUID().replace(/-/g, '')}`;
    const token: TokenMock = { tokenId: crypto.randomUUID(), nome, prefixo: segredo.slice(0, 12), criadoEm: new Date().toISOString() };
    tokensIngestao = [token, ...tokensIngestao];
    return ok({ token, segredo }, 201);
  }
  const revogarToken = c.match(/^\/api\/v1\/sessoes\/tokens\/([^/]+)$/);
  if (revogarToken && req.method === 'DELETE') {
    const token = tokensIngestao.find((t) => t.tokenId === revogarToken[1] && !t.revogadoEm);
    if (!token) return erro(404, 'Sessoes.TokenNaoEncontrado', 'Token não encontrado.');
    tokensIngestao = tokensIngestao.map((t) => (t === token ? { ...t, revogadoEm: new Date().toISOString() } : t));
    return ok(null, 204);
  }

  // ---- Consumo ----
  const consumo = responderConsumo(req, url, c);
  if (consumo) return consumo;

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
