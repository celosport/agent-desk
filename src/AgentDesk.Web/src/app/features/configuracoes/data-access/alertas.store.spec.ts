import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AlertasApi } from './alertas.api';
import { InscricaoPush, Notificacoes } from './alertas.models';
import { AlertasStore } from './alertas.store';
import { EstadoPush, PUSH_NAVEGADOR, PushNavegador } from './push-navegador';

describe('AlertasStore', () => {
  const meu: InscricaoPush = { endpoint: 'https://fcm.googleapis.com/fcm/send/meu', p256dh: 'p', auth: 'a' };
  const dadosVazios: Notificacoes = {
    chavePublica: 'BChave',
    dispositivos: [],
    preferencias: { automacoes: true, sessoes: true, permissoes: true },
  };
  const aparelho = (endpoint: string, nome: string) => ({ dispositivoId: endpoint, nome, endpoint, criadoEm: '2026-11-01T10:00:00Z' });

  const api = { obter: vi.fn(), registrar: vi.fn(), remover: vi.fn(), salvarPreferencias: vi.fn(), testar: vi.fn() };
  let estado: EstadoPush;
  let inscricaoDoNavegador: InscricaoPush | null;
  const push: PushNavegador = {
    estado: () => estado,
    inscricaoAtual: async () => inscricaoDoNavegador,
    inscrever: vi.fn(async () => {
      inscricaoDoNavegador = meu;
      return meu;
    }),
    cancelar: vi.fn(async () => {
      inscricaoDoNavegador = null;
    }),
  };
  const erroApi = (status: number, code: string, title: string) => new HttpErrorResponse({ status, error: { status, code, title } });

  const criarStore = async () => {
    TestBed.configureTestingModule({
      providers: [AlertasStore, { provide: AlertasApi, useValue: api }, { provide: PUSH_NAVEGADOR, useValue: push }],
    });
    const store = TestBed.inject(AlertasStore);
    await store.carregar();
    return store;
  };

  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    vi.mocked(push.inscrever).mockClear();
    vi.mocked(push.cancelar).mockClear();
    estado = 'disponivel';
    inscricaoDoNavegador = null;
    api.obter.mockResolvedValue(dadosVazios);
    api.registrar.mockImplementation(async (p: InscricaoPush & { nome: string }) => aparelho(p.endpoint, p.nome));
    api.remover.mockResolvedValue(undefined);
    api.salvarPreferencias.mockImplementation(async (p: unknown) => p);
  });

  it('ativa: o navegador se inscreve com a chave do servidor e o aparelho vira "ativo neste aparelho"', async () => {
    const store = await criarStore();
    expect(store.ativoNesteAparelho()).toBe(false);

    expect(await store.ativar()).toBe(true);

    expect(push.inscrever).toHaveBeenCalledWith('BChave');
    expect(api.registrar).toHaveBeenCalledWith(expect.objectContaining({ endpoint: meu.endpoint, p256dh: 'p', auth: 'a' }));
    expect(store.ativoNesteAparelho()).toBe(true);
    expect(store.dados()?.dispositivos).toHaveLength(1);
  });

  it('o aparelho de outro dispositivo aparece em "outros", e a inscrição que o servidor não conhece não conta como ativa', async () => {
    api.obter.mockResolvedValue({ ...dadosVazios, dispositivos: [aparelho('https://fcm.googleapis.com/fcm/send/celular', 'Android · Chrome')] });
    inscricaoDoNavegador = meu; // o navegador tem inscrição, mas o servidor nunca recebeu

    const store = await criarStore();

    expect(store.ativoNesteAparelho()).toBe(false);
    expect(store.outrosAparelhos().map((d) => d.nome)).toEqual(['Android · Chrome']);
  });

  it('permissão negada no pedido do navegador: vira "bloqueado" e nada é registrado', async () => {
    const store = await criarStore();
    vi.mocked(push.inscrever).mockImplementationOnce(async () => {
      estado = 'bloqueado';
      throw new Error('NotAllowedError');
    });

    expect(await store.ativar()).toBe(false);

    expect(store.estado()).toBe('bloqueado');
    expect(store.erro()).toBeNull(); // a tela explica como liberar, sem mensagem de erro
    expect(api.registrar).not.toHaveBeenCalled();
  });

  it('falha ao registrar no servidor mostra o motivo e não marca como ativo', async () => {
    const store = await criarStore();
    api.registrar.mockRejectedValue(erroApi(409, 'Notificacoes.DispositivosDemais', 'Há aparelhos demais recebendo alertas.'));

    expect(await store.ativar()).toBe(false);

    expect(store.erro()).toBe('Há aparelhos demais recebendo alertas.');
    expect(store.ativoNesteAparelho()).toBe(false);
  });

  it('desativa: tira do servidor, cancela a inscrição do navegador e some da lista', async () => {
    const store = await criarStore();
    await store.ativar();

    expect(await store.desativar()).toBe(true);

    expect(api.remover).toHaveBeenCalledWith(meu.endpoint);
    expect(push.cancelar).toHaveBeenCalled();
    expect(store.ativoNesteAparelho()).toBe(false);
    expect(store.dados()?.dispositivos).toEqual([]);
  });

  it('preferência marca na hora e volta ao valor anterior se o servidor recusar', async () => {
    const store = await criarStore();
    api.salvarPreferencias.mockRejectedValue(erroApi(500, 'x', 'Erro interno.'));

    await store.salvarPreferencias({ automacoes: true, sessoes: false, permissoes: true });

    expect(store.dados()?.preferencias.sessoes).toBe(true); // voltou
    expect(store.erro()).toBe('Tivemos um problema no servidor. Tente de novo em instantes.');
  });

  it('teste devolve em quantos aparelhos chegou; sem aparelho mostra a explicação da API', async () => {
    const store = await criarStore();
    api.testar.mockResolvedValueOnce({ entregues: 2 });
    expect(await store.testar()).toBe(2);

    api.testar.mockRejectedValueOnce(erroApi(409, 'Notificacoes.SemDispositivos', 'Nenhum aparelho está recebendo alertas.'));
    expect(await store.testar()).toBeNull();
    expect(store.erro()).toBe('Nenhum aparelho está recebendo alertas.');
  });

  it('guarda o estado do navegador (ex.: iPhone sem o app instalado)', async () => {
    estado = 'instalar-no-ios';
    const store = await criarStore();
    expect(store.estado()).toBe('instalar-no-ios');
  });
});
