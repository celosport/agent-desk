import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TarefasApi } from './tarefas.api';
import { Tarefa } from './tarefas.models';
import { TarefasStore } from './tarefas.store';

describe('TarefasStore', () => {
  const pendente: Tarefa = { tarefaId: '1', titulo: 'A', status: 'PENDENTE', criadaEm: '2026-10-30T12:00:00Z' };
  const api = { listar: vi.fn(), criar: vi.fn(), concluir: vi.fn() };

  const criarStore = () => {
    TestBed.configureTestingModule({ providers: [TarefasStore, { provide: TarefasApi, useValue: api }] });
    return TestBed.inject(TarefasStore);
  };

  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('separa pendentes e concluídas', async () => {
    api.listar.mockResolvedValue([pendente, { ...pendente, tarefaId: '2', status: 'CONCLUIDA' }]);
    const store = criarStore();
    await store.carregar();
    expect(store.pendentes().map((t) => t.tarefaId)).toEqual(['1']);
    expect(store.concluidas().map((t) => t.tarefaId)).toEqual(['2']);
  });

  it('concluir troca a tarefa na lista', async () => {
    api.listar.mockResolvedValue([pendente]);
    api.concluir.mockResolvedValue({ ...pendente, status: 'CONCLUIDA' });
    const store = criarStore();
    await store.carregar();
    expect(await store.concluir('1')).toBeNull();
    expect(store.concluidas()).toHaveLength(1);
  });

  it('"já concluída" (code Tarefas.JaConcluida) recarrega em vez de mostrar erro', async () => {
    api.listar.mockResolvedValue([pendente]);
    api.concluir.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'Tarefas.JaConcluida', title: 'Já foi.' } }));
    const store = criarStore();
    await store.carregar();
    expect(await store.concluir('1')).toBeNull();
    expect(api.listar).toHaveBeenCalledTimes(2);
  });
});
