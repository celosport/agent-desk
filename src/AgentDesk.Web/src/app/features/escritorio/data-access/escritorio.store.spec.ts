import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { EscritorioApi } from './escritorio.api';
import { ExecucaoResumo } from './escritorio.models';
import { EscritorioStore, textoDoResultado } from './escritorio.store';

describe('EscritorioStore', () => {
  const api = { automacoes: vi.fn(), executar: vi.fn() };
  const execucao: ExecucaoResumo = {
    chamadaId: 'c1',
    codigo: 'resumir-documento',
    modeloUsado: 'claude-haiku-5-5',
    truncado: false,
    tokens: { total: 1800 },
    custoUsd: 0.000365,
  };
  let relogio = 0;
  /** O Intl separa "US$" do valor com espaço não separável (U+00A0). */
  const texto = (t: string) => t.replace(/\s/g, ' ');

  const criar = async (reduzido = true) => {
    TestBed.configureTestingModule({ providers: [EscritorioStore, { provide: EscritorioApi, useValue: api }] });
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
    expect(api.executar).toHaveBeenCalledWith('3', 'texto');

    relogio = 1000; // depois do mínimo do "pensando…"
    responder(execucao);
    expect(await promessa).toBe(true);
    expect(texto(store.status()[1].status)).toBe('terminou: 1.800 tokens · US$ 0,0004');
    expect(store.status()[0].status).toBe('disponível'); // o outro agente nem se mexeu
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
