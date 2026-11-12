import { TestBed } from '@angular/core/testing';
import { AvisosApi } from './avisos.api';
import { Destinatario } from './avisos.models';
import { AvisosStore, resumoDoEnvio } from './avisos.store';

describe('AvisosStore', () => {
  const pessoa = (id: string, aparelhos: number): Destinatario => ({ usuarioId: id, nome: `Pessoa ${id}`, email: `${id}@x.dev`, aparelhos, ehAdmin: false });
  const api = { destinatarios: vi.fn(), enviar: vi.fn() };
  let store: AvisosStore;

  beforeEach(async () => {
    api.destinatarios.mockReset().mockResolvedValue([pessoa('a', 1), pessoa('b', 0), pessoa('c', 2)]);
    api.enviar.mockReset().mockResolvedValue({ escolhidos: 1, alcancados: 1, semAparelho: 0, falhas: 0 });
    TestBed.configureTestingModule({ providers: [AvisosStore, { provide: AvisosApi, useValue: api }] });
    store = TestBed.inject(AvisosStore);
    await store.carregar();
  });

  it('sem ninguém marcado não envia', async () => {
    expect(await store.enviar('T', 'M')).toBe(false);
    expect(api.enviar).not.toHaveBeenCalled();
    expect(store.erro()).toBe('Escolha pelo menos uma pessoa.');
  });

  it('manda só os ids marcados', async () => {
    store.alternar('a');
    await store.enviar(' Título ', ' texto ');
    expect(api.enviar).toHaveBeenCalledWith({ usuarioIds: ['a'], titulo: 'Título', mensagem: 'texto', url: '/' });
  });

  it('todos marcados envia como "todos" (ids nulos)', async () => {
    store.alternarTodos();
    expect(store.todosMarcados()).toBe(true);
    await store.enviar('T', 'M');
    expect(api.enviar.mock.calls[0][0].usuarioIds).toBeNull();
  });

  it('"só quem tem alertas" marca quem tem aparelho', () => {
    store.marcarComAparelho();
    expect([...store.selecionados()].sort()).toEqual(['a', 'c']);
  });

  it('mostra o erro do servidor e não perde a seleção', async () => {
    api.enviar.mockRejectedValue({ error: { code: 'X', detail: 'Falhou no servidor.' }, status: 400 });
    store.alternar('a');
    expect(await store.enviar('T', 'M')).toBe(false);
    expect(store.selecionados().size).toBe(1);
    expect(store.erro()).toBeTruthy();
  });

  it('resumo em português claro', () => {
    expect(resumoDoEnvio({ escolhidos: 3, alcancados: 1, semAparelho: 1, falhas: 1 }))
      .toBe('Aviso enviado para 1 de 3 pessoas. 1 ainda não ativou os alertas no celular. 1 com falha no serviço de push.');
    expect(resumoDoEnvio({ escolhidos: 2, alcancados: 0, semAparelho: 2, falhas: 0 })).toContain('2 ainda não ativaram');
  });
});
