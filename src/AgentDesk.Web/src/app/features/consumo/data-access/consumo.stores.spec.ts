import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ConsumoApi } from './consumo.api';
import { PaginaChamadas, ResumoConsumo } from './consumo.models';
import { HistoricoStore } from './historico.store';
import { PainelStore } from './painel.store';

const zero = { chamadas: 0, tokens: 0, custoUsd: 0 };
const resumo = (escopo: 'MEU' | 'TODOS', custoMes = 0, percentualLimite?: number): ResumoConsumo => ({
  escopo,
  hoje: zero,
  mes: { ...zero, custoUsd: custoMes, chamadas: custoMes ? 1 : 0 },
  acumulado: { ...zero, custoUsd: custoMes, chamadas: custoMes ? 1 : 0 },
  dias: 30,
  porDia: [],
  ranking: [],
  percentualLimite,
  atualizadoEm: '2026-10-30T12:00:00Z',
});
const pagina = (total: number, numero = 1): PaginaChamadas => ({ itens: [], total, pagina: numero, tamanho: 20, totais: zero });

describe('PainelStore', () => {
  const api = { resumo: vi.fn(), chamadas: vi.fn(), chamada: vi.fn(), filtros: vi.fn() };
  const criar = () => {
    TestBed.configureTestingModule({ providers: [PainelStore, { provide: ConsumoApi, useValue: api }] });
    return TestBed.inject(PainelStore);
  };
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('falha no polling mantém os números anteriores e propaga o erro (para o polling esperar mais)', async () => {
    const store = criar();
    api.resumo.mockResolvedValueOnce(resumo('MEU', 1.5, 85));
    await store.atualizar();
    expect(store.estadoLimite()).toBe('alerta');

    api.resumo.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await expect(store.atualizar()).rejects.toBeTruthy();
    expect(store.resumo()?.mes.custoUsd).toBe(1.5);
    expect(store.erro()).toContain('Sem conexão');
  });

  it('trocar o escopo limpa a tela e ignora a resposta atrasada do escopo anterior', async () => {
    const store = criar();
    let responderMeu!: (r: ResumoConsumo) => void;
    api.resumo.mockReturnValueOnce(new Promise<ResumoConsumo>((r) => (responderMeu = r)));
    const lenta = store.atualizar();

    api.resumo.mockResolvedValueOnce(resumo('TODOS', 99));
    await store.trocarEscopo('TODOS');
    responderMeu(resumo('MEU', 1));
    await lenta;

    expect(store.resumo()?.escopo).toBe('TODOS');
    expect(api.resumo).toHaveBeenLastCalledWith('TODOS');
  });
});

describe('HistoricoStore', () => {
  const api = { resumo: vi.fn(), chamadas: vi.fn(), chamada: vi.fn(), filtros: vi.fn() };
  const criar = async () => {
    TestBed.configureTestingModule({ providers: [HistoricoStore, { provide: ConsumoApi, useValue: api }] });
    const store = TestBed.inject(HistoricoStore);
    await store.carregar();
    return store;
  };
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.chamadas.mockResolvedValue(pagina(45));
    api.filtros.mockResolvedValue({ automacoes: [], modelos: [] });
  });

  it('filtrar volta para a página 1; paginação respeita o total', async () => {
    const store = await criar();
    expect(store.totalPaginas()).toBe(3);

    await store.irPara(3);
    expect(store.filtro().pagina).toBe(3);
    await store.irPara(9); // além do fim: fica na última, sem consultar de novo
    expect(api.chamadas).toHaveBeenCalledTimes(2);

    await store.filtrar({ status: 'ERRO' });
    expect(store.filtro()).toMatchObject({ status: 'ERRO', pagina: 1 });
    expect(api.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ERRO', pagina: 1 }));
  });

  it('limpar mantém o escopo; abrir uma chamada de outro usuário mostra o erro da API', async () => {
    const store = await criar();
    await store.filtrar({ escopo: 'TODOS', modeloId: 'claude-opus-5-5' });
    await store.limpar();
    expect(store.filtro()).toMatchObject({ escopo: 'TODOS', modeloId: '' });

    api.chamada.mockRejectedValue(
      new HttpErrorResponse({ status: 404, error: { code: 'Consumo.ChamadaNaoEncontrada', title: 'Chamada não encontrada.' } }),
    );
    await store.abrir('x');
    expect(store.detalhe()).toBeNull();
    expect(store.erroDetalhe()).toBe('Chamada não encontrada.');
  });
});
