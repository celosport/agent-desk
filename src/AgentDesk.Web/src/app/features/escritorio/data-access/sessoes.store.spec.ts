import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { SessoesApi } from './sessoes.api';
import { AoVivo, SessaoAoVivo } from './sessoes.models';
import { SessoesStore } from './sessoes.store';

describe('SessoesStore', () => {
  const api = { aoVivo: vi.fn() };
  const sessao = (sessaoId: string, status: SessaoAoVivo['status'], atividade?: string): SessaoAoVivo => ({
    sessaoId,
    maquina: 'Notebook',
    status,
    atividade,
    tokens: 0,
    tokensCacheLeitura: 0,
    custoUsd: 0,
    pedidos: 0,
    iniciadaEm: '2026-10-30T12:00:00Z',
    ultimaAtividadeEm: '2026-10-30T12:00:00Z',
  });
  const aoVivo = (...projetos: [string, SessaoAoVivo[]][]): AoVivo => ({
    projetos: projetos.map(([nome, sessoes]) => ({ chave: `chave-${nome}`, nome, sessoes })),
    atualizadoEm: '2026-10-30T12:00:00Z',
  });

  const criar = () => {
    TestBed.configureTestingModule({ providers: [SessoesStore, { provide: SessoesApi, useValue: api }] });
    const store = TestBed.inject(SessoesStore);
    store.agora = () => 0;
    store.reduzido = true;
    return store;
  };

  beforeEach(() => api.aoVivo.mockReset());

  it('abre na sala que precisa de você e põe um robô por sessão, cada um no seu lugar', async () => {
    api.aoVivo.mockResolvedValue(
      aoVivo(['loja', [sessao('a', 'OCIOSA')]], ['app', [sessao('b', 'TRABALHANDO', '📖 Lendo api.ts'), sessao('c', 'ESPERANDO_VOCE', '✋ Precisa de você')]]),
    );
    const store = criar();
    await store.atualizar();

    expect(store.projeto()?.nome).toBe('app');
    expect(store.agentes.map((a) => a.codigo)).toEqual(['b', 'c']);
    expect(store.agentes[0].balao?.texto).toBe('📖 Lendo api.ts');
    expect(store.agentes[1].balao?.tipo).toBe('alerta');
    expect(store.esperandoVoce()).toBe(1);
    expect(store.anuncio()).toContain('✋ Precisa de você');
  });

  it('quem chega pega a mesa livre; quem fica mantém o lugar', async () => {
    api.aoVivo.mockResolvedValueOnce(aoVivo(['app', [sessao('a', 'TRABALHANDO'), sessao('b', 'TRABALHANDO')]]));
    const store = criar();
    await store.atualizar();
    const mesaDoB = store.agentes[1].mesa;

    api.aoVivo.mockResolvedValueOnce(aoVivo(['app', [sessao('b', 'TRABALHANDO'), sessao('c', 'TRABALHANDO')]]));
    await store.atualizar();

    expect(store.agentes.map((a) => a.codigo)).toEqual(['b', 'c']);
    expect(store.agentes[0].mesa).toEqual(mesaDoB);
    expect(store.agentes[1].mesa).toEqual({ x: 1, y: 2 }); // a mesa que o "a" liberou
  });

  it('trocar de sala troca os robôs; mais de 8 sessões ficam fora da sala', async () => {
    const muitas = Array.from({ length: 10 }, (_, i) => sessao(`s${i}`, 'OCIOSA'));
    api.aoVivo.mockResolvedValue(aoVivo(['loja', [sessao('a', 'OCIOSA')]], ['app', muitas]));
    const store = criar();
    await store.atualizar();

    store.escolherProjeto('chave-app');
    expect(store.agentes).toHaveLength(8);
    expect(store.foraDaSala()).toBe(2);
  });

  it('falha no polling mostra o erro e propaga (o polling espera mais)', async () => {
    api.aoVivo.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    const store = criar();
    await expect(store.atualizar()).rejects.toBeTruthy();
    expect(store.erro()).toContain('Sem conexão');
  });
});
