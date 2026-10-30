import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ConfiguracoesApi } from './configuracoes.api';
import { Configuracao, Modelo } from './configuracoes.models';
import { ConfiguracoesStore } from './configuracoes.store';

describe('ConfiguracoesStore', () => {
  const semChave: Configuracao = { chaveApiConfigurada: false, bloquearAoAtingirLimite: true };
  const modelo = (modeloId: string, ativo = true): Modelo => ({
    modeloId,
    nomeExibicao: modeloId,
    precoEntradaMTok: 1,
    precoSaidaMTok: 5,
    ativo,
    fallbackRecusa: false,
    atualizadoEm: '2026-10-30T12:00:00Z',
  });
  const api = {
    obter: vi.fn(),
    salvarChave: vi.fn(),
    removerChave: vi.fn(),
    testarChave: vi.fn(),
    salvarPreferencias: vi.fn(),
    listarModelos: vi.fn(),
    criarModelo: vi.fn(),
    atualizarModelo: vi.fn(),
  };
  const erroApi = (status: number, code: string, title: string) => new HttpErrorResponse({ status, error: { status, code, title } });

  const criarStore = async () => {
    TestBed.configureTestingModule({ providers: [ConfiguracoesStore, { provide: ConfiguracoesApi, useValue: api }] });
    const store = TestBed.inject(ConfiguracoesStore);
    await store.carregar();
    return store;
  };

  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.obter.mockResolvedValue(semChave);
    api.listarModelos.mockResolvedValue([modelo('claude-opus-5-5'), modelo('claude-antigo', false)]);
  });

  it('carrega configuração e modelos; só os ativos podem ser padrão', async () => {
    const store = await criarStore();
    expect(store.configuracao()).toEqual(semChave);
    expect(store.modelosAtivos().map((m) => m.modeloId)).toEqual(['claude-opus-5-5']);
  });

  it('avisa quando o modelo padrão salvo foi desativado', async () => {
    api.obter.mockResolvedValue({ ...semChave, modeloPadraoId: 'claude-antigo' });
    const store = await criarStore();
    expect(store.modeloPadraoInativo()).toBe(true);
  });

  it('salvar a chave guarda só o que a API devolve (a máscara)', async () => {
    api.salvarChave.mockResolvedValue({ ...semChave, chaveApiConfigurada: true, chaveApiMascarada: 'sk-ant-...WXYZ' });
    const store = await criarStore();
    expect(await store.salvarChave('sk-ant-segredo-WXYZ')).toBeNull();
    expect(store.configuracao()?.chaveApiMascarada).toBe('sk-ant-...WXYZ');
    expect(JSON.stringify(store.configuracao())).not.toContain('segredo');
  });

  it('testar: chave recusada (Anthropic.ChaveInvalida) é "invalida"; Anthropic fora é "erro" com o texto da API', async () => {
    const store = await criarStore();
    api.testarChave.mockRejectedValueOnce(erroApi(422, 'Anthropic.ChaveInvalida', 'A Anthropic recusou a chave.'));
    expect(await store.testarChave()).toEqual({ tipo: 'invalida', mensagem: 'A Anthropic recusou a chave.' });

    api.testarChave.mockRejectedValueOnce(erroApi(503, 'Anthropic.Indisponivel', 'A API da Anthropic não respondeu.'));
    expect(await store.testarChave()).toEqual({ tipo: 'erro', mensagem: 'A API da Anthropic não respondeu.' });

    api.testarChave.mockResolvedValueOnce({ valida: true, testadaEm: '2026-10-30T12:00:00Z' });
    expect((await store.testarChave()).tipo).toBe('valida');
  });

  it('testar sem chave legível (Configuracoes.ChaveNaoConfigurada) recarrega a configuração', async () => {
    const store = await criarStore();
    api.testarChave.mockRejectedValue(erroApi(422, 'Configuracoes.ChaveNaoConfigurada', 'Cadastre a sua API key.'));
    await store.testarChave();
    expect(api.obter).toHaveBeenCalledTimes(2);
  });

  it('modelo desativado no meio do caminho (Configuracoes.ModeloInvalido) atualiza a lista de modelos', async () => {
    const store = await criarStore();
    api.salvarPreferencias.mockRejectedValue(erroApi(422, 'Configuracoes.ModeloInvalido', 'Escolha um modelo ativo.'));
    api.listarModelos.mockResolvedValue([modelo('claude-opus-5-5', false)]);
    expect(await store.salvarPreferencias({ modeloPadraoId: 'claude-opus-5-5', limiteMensalUsd: null, bloquearAoAtingirLimite: true }))
      .toBe('Escolha um modelo ativo.');
    expect(store.modelosAtivos()).toHaveLength(0);
  });

  it('ADMIN: editar troca o modelo na lista', async () => {
    const store = await criarStore();
    api.atualizarModelo.mockResolvedValue({ ...modelo('claude-opus-5-5'), precoSaidaMTok: 30 });
    expect(
      await store.atualizarModelo('claude-opus-5-5', {
        nomeExibicao: 'Opus',
        precoEntradaMTok: 1,
        precoSaidaMTok: 30,
        precoCacheLeituraMTok: null,
        precoCacheEscritaMTok: null,
        fallbackRecusa: false,
        ativo: true,
      }),
    ).toBeNull();
    expect(store.modelos().find((m) => m.modeloId === 'claude-opus-5-5')?.precoSaidaMTok).toBe(30);
  });
});
