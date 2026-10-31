import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { EquipeApi } from './equipe.api';
import { EquipeStore } from './equipe.store';
import { EscritorioApi } from './escritorio.api';
import { ExecucaoResumo } from './escritorio.models';
import { EscritorioStore, textoDoResultado } from './escritorio.store';

describe('EscritorioStore', () => {
  const api = { automacoes: vi.fn(), executar: vi.fn(), cancelar: vi.fn() };
  const apiEquipe = { listar: vi.fn().mockResolvedValue([]), salvar: vi.fn(), restaurar: vi.fn() };
  const execucao: ExecucaoResumo = {
    chamadaId: 'c1',
    codigo: 'resumir-documento',
    modeloUsado: 'claude-haiku-5-5',
    truncado: false,
    tokens: { total: 1800 },
    custoUsd: 0.000365,
    duracaoMs: 7000,
    iniciadaEm: '2026-10-31T11:15:02Z',
    finalizadaEm: '2026-10-31T11:15:09Z',
  };
  let relogio = 0;
  /** O Intl separa "US$" do valor com espaço não separável (U+00A0). */
  const texto = (t: string) => t.replace(/\s/g, ' ');

  const criar = async (reduzido = true) => {
    TestBed.configureTestingModule({ providers: [EscritorioStore, EquipeStore, { provide: EscritorioApi, useValue: api }, { provide: EquipeApi, useValue: apiEquipe }] });
    const store = TestBed.inject(EscritorioStore);
    store.agora = () => relogio;
    store.reduzido = reduzido;
    await store.carregar();
    return store;
  };

  beforeEach(() => {
    relogio = 0;
    Object.values(api).forEach((f) => f.mockReset());
    api.automacoes.mockResolvedValue([
      { automacaoId: '1', codigo: 'relatorio-executivo', nome: 'Gerar Relatório Executivo', descricao: '' },
      { automacaoId: '3', codigo: 'resumir-documento', nome: 'Resumir Documento', descricao: '' },
    ]);
  });

  it('um agente por automação, com o primeiro selecionado', async () => {
    const store = await criar();
    expect(store.status().map((s) => s.apelido)).toEqual(['Rel', 'Sumi']);
    expect(store.selecionado()).toBe('relatorio-executivo');
    expect(store.status().every((s) => s.status === 'disponível')).toBe(true);
  });

  it('executar: pensa, mostra tokens e custo e não aceita outra execução do mesmo agente no meio', async () => {
    const store = await criar();
    let responder!: (e: ExecucaoResumo) => void;
    api.executar.mockReturnValue(new Promise<ExecucaoResumo>((r) => (responder = r)));

    const promessa = store.executar('resumir-documento', 'texto');
    expect(store.status()[1]).toMatchObject({ status: 'pensando…', ocupado: true });
    expect(await store.executar('resumir-documento', 'de novo')).toBe(false);
    expect(api.executar).toHaveBeenCalledWith('3', 'texto', expect.stringMatching(/^[0-9a-f-]{36}$/));

    relogio = 1000; // depois do mínimo do "pensando…"
    responder(execucao);
    expect(await promessa).toBe(true);
    expect(texto(store.status()[1].status)).toBe('terminou: 1.800 tokens · US$ 0,0004');
    expect(store.status()[0].status).toBe('disponível'); // o outro agente nem se mexeu
  });

  it('cancelar: o agente mostra o cronômetro, a API recebe o id da execução e o balão diz "cancelada" sem painel de erro', async () => {
    const store = await criar();
    let rejeitar!: (e: unknown) => void;
    api.executar.mockReturnValue(new Promise<ExecucaoResumo>((_, r) => (rejeitar = r)));
    api.cancelar.mockResolvedValue(undefined);

    const promessa = store.executar('resumir-documento', 'texto');
    const inicio = Date.now();
    store.relogioMs.set(inicio + 12_000);
    expect(store.status()[1]).toMatchObject({ cancelavel: true, trabalhandoHa: '12 s' });
    expect(store.status()[0]).toMatchObject({ cancelavel: false, trabalhandoHa: null });

    await store.cancelar('resumir-documento');
    const execucaoId = api.executar.mock.calls[0][2];
    expect(api.cancelar).toHaveBeenCalledWith(execucaoId);

    rejeitar(new HttpErrorResponse({ status: 422, error: { code: 'Automacoes.Cancelada', title: 'Execução cancelada.' } }));
    expect(await promessa).toBe(false);
    expect(store.falha()).toBeNull();
    expect(store.status()[1].cancelavel).toBe(false);
    relogio = 1000;
    store.passo(16);
    expect(store.status()[1].status).toBe('erro: Execução cancelada');
  });

  it('cancelar sem execução em andamento não chama a API; 404 da API (já terminou) é ignorado', async () => {
    const store = await criar();
    await store.cancelar('resumir-documento');
    expect(api.cancelar).not.toHaveBeenCalled();

    let responder!: (e: ExecucaoResumo) => void;
    api.executar.mockReturnValue(new Promise<ExecucaoResumo>((r) => (responder = r)));
    api.cancelar.mockRejectedValue(new HttpErrorResponse({ status: 404, error: { code: 'Automacoes.ExecucaoNaoEncontrada' } }));
    const promessa = store.executar('resumir-documento', 'texto');
    await expect(store.cancelar('resumir-documento')).resolves.toBeUndefined();
    relogio = 1000;
    responder(execucao);
    expect(await promessa).toBe(true);
  });

  it('erro da API vira balão de erro e, se for de configuração, oferece Configurações', async () => {
    const store = await criar();
    api.executar.mockRejectedValue(
      new HttpErrorResponse({ status: 422, error: { code: 'Automacoes.ChaveNaoConfigurada', title: 'Cadastre a sua API key.' } }),
    );
    expect(await store.executar('relatorio-executivo', 'x')).toBe(false);
    expect(store.falha()).toEqual({ codigo: 'relatorio-executivo', mensagem: 'Cadastre a sua API key.', irParaConfiguracoes: true });
    expect(store.status()[0].status).toBe('pensando…'); // o erro chegou antes do mínimo do "pensando…"

    relogio = 1000;
    store.passo(16);
    expect(store.status()[0].status).toBe('erro: Cadastre a sua API key.');
  });

  it('o passo do motor só avisa a tela quando muda fase ou balão', async () => {
    const store = await criar(false);
    const antes = store.versao();
    store.passo(16);
    expect(store.versao()).toBe(antes);
  });

  it('texto do resultado inclui o limite e a resposta cortada', () => {
    expect(texto(textoDoResultado({ ...execucao, custoUsd: 1.5, alertaLimite: { percentual: 85, atingido: false } }))).toBe(
      '1.800 tokens · US$ 1,50 · 85% do limite',
    );
    expect(texto(textoDoResultado({ ...execucao, truncado: true, alertaLimite: { percentual: 120, atingido: true } }))).toBe(
      '1.800 tokens · US$ 0,0004 · limite atingido · cortada',
    );
  });
});
