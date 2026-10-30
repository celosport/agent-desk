import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AutomacoesApi } from './automacoes.api';
import { Automacao, Execucao } from './automacoes.models';
import { AutomacoesStore } from './automacoes.store';

describe('AutomacoesStore', () => {
  const automacao = (automacaoId: string, ativa = true): Automacao => ({
    automacaoId,
    codigo: automacaoId,
    nome: `Fluxo ${automacaoId}`,
    descricao: '',
    promptSistema: '',
    modeloMensagem: '{{entrada}}',
    modeloId: 'claude-opus-5-5',
    maxTokens: 1000,
    ativa,
  });
  const execucao: Execucao = {
    chamadaId: 'c1',
    automacaoId: 'a',
    codigo: 'a',
    modeloId: 'claude-opus-5-5',
    modeloUsado: 'claude-opus-5-5',
    resultado: '# Ok',
    truncado: false,
    tokens: { entrada: 10, saida: 5, cacheLeitura: 0, cacheEscrita: 0, total: 15 },
    custoUsd: 0.0001,
    duracaoMs: 900,
    iniciadaEm: '2026-10-30T12:00:00Z',
  };
  const api = { listar: vi.fn(), atualizar: vi.fn(), executar: vi.fn(), listarModelos: vi.fn() };
  const erroApi = (status: number, code: string, title: string) => new HttpErrorResponse({ status, error: { status, code, title } });

  const criarStore = async () => {
    TestBed.configureTestingModule({ providers: [AutomacoesStore, { provide: AutomacoesApi, useValue: api }] });
    const store = TestBed.inject(AutomacoesStore);
    await store.carregar();
    return store;
  };

  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.listar.mockResolvedValue([automacao('inativa', false), automacao('a'), automacao('b')]);
    api.listarModelos.mockResolvedValue([
      { modeloId: 'claude-opus-5-5', nomeExibicao: 'Claude Opus 5.5', precoEntradaMTok: 4, precoSaidaMTok: 20, ativo: true },
      { modeloId: 'claude-velho', nomeExibicao: 'Velho', precoEntradaMTok: 1, precoSaidaMTok: 1, ativo: false },
    ]);
  });

  it('começa com a primeira automação ativa selecionada e só oferece modelos ativos', async () => {
    const store = await criarStore();
    expect(store.selecionada()?.automacaoId).toBe('a');
    expect(store.modelosAtivos().map((m) => m.modeloId)).toEqual(['claude-opus-5-5']);
    expect(store.nomeDoModelo('claude-opus-5-5')).toBe('Claude Opus 5.5');
    expect(store.nomeDoModelo(undefined)).toBe('seu modelo padrão');
  });

  it('executa a automação selecionada e marca quem está rodando', async () => {
    const store = await criarStore();
    let resolver!: (e: Execucao) => void;
    api.executar.mockReturnValue(new Promise<Execucao>((r) => (resolver = r)));

    const promessa = store.executar({ entrada: 'texto', modeloId: null, nomeArquivo: null });
    expect(store.executando()).toBe('a');
    expect(await store.executar({ entrada: 'de novo', modeloId: null, nomeArquivo: null })).toBeNull(); // uma por vez
    resolver(execucao);
    expect(await promessa).toEqual(execucao);

    expect(store.executando()).toBeNull();
    expect(store.execucao()).toEqual(execucao);
    expect(api.executar).toHaveBeenCalledTimes(1);
    expect(api.executar).toHaveBeenCalledWith('a', { entrada: 'texto', modeloId: null, nomeArquivo: null });
  });

  it('falta de chave ou limite atingido levam para Configurações; recusa e Anthropic fora, não', async () => {
    const store = await criarStore();

    api.executar.mockRejectedValueOnce(erroApi(422, 'Automacoes.ChaveNaoConfigurada', 'Cadastre a sua API key.'));
    await store.executar({ entrada: 'x', modeloId: null, nomeArquivo: null });
    expect(store.falha()).toEqual({ codigo: 'Automacoes.ChaveNaoConfigurada', mensagem: 'Cadastre a sua API key.', irParaConfiguracoes: true });

    api.executar.mockRejectedValueOnce(erroApi(422, 'Automacoes.LimiteMensalAtingido', 'Você atingiu o limite.'));
    await store.executar({ entrada: 'x', modeloId: null, nomeArquivo: null });
    expect(store.falha()?.irParaConfiguracoes).toBe(true);

    api.executar.mockRejectedValueOnce(erroApi(422, 'Automacoes.Recusada', 'A Claude recusou.'));
    await store.executar({ entrada: 'x', modeloId: null, nomeArquivo: null });
    expect(store.falha()?.irParaConfiguracoes).toBe(false);

    api.executar.mockRejectedValueOnce(erroApi(503, 'Anthropic.Indisponivel', 'A API da Anthropic não respondeu.'));
    await store.executar({ entrada: 'x', modeloId: null, nomeArquivo: null });
    expect(store.falha()).toEqual({ codigo: 'Anthropic.Indisponivel', mensagem: 'A API da Anthropic não respondeu.', irParaConfiguracoes: false });
  });

  it('trocar de automação limpa o resultado anterior (mas não durante uma execução)', async () => {
    const store = await criarStore();
    api.executar.mockResolvedValue(execucao);
    await store.executar({ entrada: 'x', modeloId: null, nomeArquivo: null });

    store.selecionar('b');
    expect(store.selecionada()?.automacaoId).toBe('b');
    expect(store.execucao()).toBeNull();
  });
});
