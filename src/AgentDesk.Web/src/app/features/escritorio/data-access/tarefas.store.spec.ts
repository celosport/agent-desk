import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TarefasApi } from './tarefas.api';
import { Computador, Tarefa } from './tarefas.models';
import { TarefasStore } from './tarefas.store';

describe('TarefasStore', () => {
  const api = { computadores: vi.fn(), tarefas: vi.fn(), enviar: vi.fn(), cancelar: vi.fn() };
  const notebook: Computador = { maquina: 'Notebook', online: true, pastas: [{ projetoChave: 'aaaaaaaaaaaa', projeto: 'loja' }, { projetoChave: 'bbbbbbbbbbbb', projeto: 'api' }] };
  const desktop: Computador = { maquina: 'Desktop', online: false, pastas: [{ projetoChave: 'cccccccccccc', projeto: 'site' }] };
  const tarefa = (tarefaId: string, status: Tarefa['status'], texto = 'Rode os testes'): Tarefa => ({
    tarefaId, maquina: 'Notebook', projetoChave: 'aaaaaaaaaaaa', projeto: 'loja', texto, status, criadaEm: '2026-11-03T12:00:00Z',
  });

  const criar = () => {
    TestBed.configureTestingModule({ providers: [TarefasStore, { provide: TarefasApi, useValue: api }] });
    return TestBed.inject(TarefasStore);
  };

  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.computadores.mockResolvedValue([desktop, notebook]);
    api.tarefas.mockResolvedValue([]);
  });

  it('carrega computadores e tarefas; o formulário começa no primeiro computador ONLINE e na primeira pasta', async () => {
    const store = criar();
    await store.atualizar();

    expect(store.carregado()).toBe(true);
    expect(store.computador()?.maquina).toBe('Notebook');
    expect(store.pastas().map((p) => p.projeto)).toEqual(['loja', 'api']);
    expect(store.pasta()?.projeto).toBe('loja');
  });

  it('trocar de computador troca as pastas e volta para a primeira', async () => {
    const store = criar();
    await store.atualizar();
    store.projetoEscolhido.set('bbbbbbbbbbbb');
    expect(store.pasta()?.projeto).toBe('api');

    store.escolherComputador('Desktop');

    expect(store.computador()?.online).toBe(false);
    expect(store.pasta()?.projeto).toBe('site');
  });

  it('só envia com texto, computador e pasta; o texto passa de 4000 caracteres = não envia', async () => {
    const store = criar();
    await store.atualizar();
    expect(store.podeEnviar()).toBe(false); // sem texto

    store.texto.set('   ');
    expect(store.podeEnviar()).toBe(false);

    store.texto.set('Rode os testes');
    expect(store.podeEnviar()).toBe(true);

    store.texto.set('x'.repeat(4001));
    expect(store.podeEnviar()).toBe(false);
  });

  it('enviar manda o computador, a chave da pasta e o texto aparado; a tarefa nova vai para o topo e o texto é limpo', async () => {
    api.tarefas.mockResolvedValue([tarefa('t-velha', 'CONCLUIDA')]);
    api.enviar.mockResolvedValue(tarefa('t-nova', 'PENDENTE', 'Corrija o bug'));
    const store = criar();
    await store.atualizar();
    store.texto.set('  Corrija o bug  ');

    await store.enviar();

    expect(api.enviar).toHaveBeenCalledWith({ maquina: 'Notebook', projetoChave: 'aaaaaaaaaaaa', texto: 'Corrija o bug' });
    expect(store.tarefas().map((t) => t.tarefaId)).toEqual(['t-nova', 't-velha']);
    expect(store.texto()).toBe('');
    expect(store.abertas()).toBe(1);
    expect(store.enviando()).toBe(false);
  });

  it('erro do servidor (limite de 5, pasta tirada no PC) vira mensagem e o texto digitado fica', async () => {
    api.enviar.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'Sessoes.LimiteDeTarefas', title: 'Já há 5 tarefas esperando ou rodando.' } }));
    const store = criar();
    await store.atualizar();
    store.texto.set('Mais uma');

    await store.enviar();

    expect(store.erroEnvio()).toBe('Já há 5 tarefas esperando ou rodando.');
    expect(store.texto()).toBe('Mais uma');
    expect(store.enviando()).toBe(false);
  });

  it('cancelar chama a API e atualiza a lista; falha (já começou) mostra o motivo', async () => {
    api.tarefas.mockResolvedValueOnce([tarefa('t1', 'PENDENTE')]).mockResolvedValueOnce([tarefa('t1', 'CANCELADA')]);
    api.cancelar.mockResolvedValue(undefined);
    const store = criar();
    await store.atualizar();

    await store.cancelar('t1');

    expect(api.cancelar).toHaveBeenCalledWith('t1');
    expect(store.tarefas()[0].status).toBe('CANCELADA');

    api.cancelar.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'Sessoes.TarefaJaIniciada', title: 'A tarefa já começou ou terminou.' } }));
    await store.cancelar('t1');
    expect(store.erroEnvio()).toBe('A tarefa já começou ou terminou.');
  });

  it('falha ao atualizar mostra o erro e propaga (o polling espera mais)', async () => {
    api.computadores.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = criar();

    await expect(store.atualizar()).rejects.toBeTruthy();
    expect(store.erro()).toContain('Sem conexão');
    expect(store.carregado()).toBe(true);
  });

  it('sem nenhum computador não há o que enviar', async () => {
    api.computadores.mockResolvedValue([]);
    const store = criar();
    await store.atualizar();
    store.texto.set('Algo');

    expect(store.computador()).toBeNull();
    expect(store.podeEnviar()).toBe(false);
  });
});
