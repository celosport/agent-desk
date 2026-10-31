import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { EquipeApi } from './equipe.api';
import { AgenteEquipe } from './equipe.models';
import { EquipeStore } from './equipe.store';

describe('EquipeStore', () => {
  const api = { listar: vi.fn(), salvar: vi.fn(), restaurar: vi.fn() };
  const agente = (extra: Partial<AgenteEquipe> = {}): AgenteEquipe => ({
    alvo: 'AUTOMACAO',
    chave: 'resumir-documento',
    ordem: 0,
    nome: 'Sumizinho',
    corCabeca: '#111111',
    corCorpo: '#222222',
    corDetalhe: '#333333',
    corOlhos: '#444444',
    acessorio: 'BONE',
    antena: 'BOLINHA',
    expressao: 'FELIZ',
    atualizadoEm: '2026-10-31T12:00:00Z',
    ...extra,
  });

  const criar = () => {
    TestBed.configureTestingModule({ providers: [EquipeStore, { provide: EquipeApi, useValue: api }] });
    return TestBed.inject(EquipeStore);
  };

  beforeEach(() => {
    api.listar.mockReset();
    api.salvar.mockReset();
    api.restaurar.mockReset();
  });

  it('agente personalizado usa o nome e a aparência salvos; os outros ficam no padrão', async () => {
    api.listar.mockResolvedValue([agente()]);
    const store = criar();
    await store.carregar();

    const sumi = store.visualAutomacao('resumir-documento');
    expect(sumi.apelido).toBe('Sumizinho');
    expect(sumi.paleta.b).toBe('#111111');
    expect(sumi.paleta.f).toBe('#222222');
    expect(sumi.acessorio).toBe('BONE');
    expect(store.visualAutomacao('relatorio-executivo').apelido).toBe('Rel');
  });

  it('salvar troca o agente da mesma identidade (não duplica); restaurar volta ao padrão', async () => {
    api.listar.mockResolvedValue([]);
    const store = criar();
    await store.carregar();

    api.salvar.mockResolvedValueOnce(agente({ nome: 'Um' }));
    await store.salvar(agente({ nome: 'Um' }));
    api.salvar.mockResolvedValueOnce(agente({ nome: 'Dois' }));
    await store.salvar(agente({ nome: 'Dois' }));
    expect(store.agentes()).toHaveLength(1);
    expect(store.visualAutomacao('resumir-documento').apelido).toBe('Dois');

    api.restaurar.mockResolvedValueOnce(undefined);
    await store.restaurar('AUTOMACAO', 'resumir-documento', 0);
    expect(api.restaurar).toHaveBeenCalledWith('AUTOMACAO', 'resumir-documento', 0);
    expect(store.visualAutomacao('resumir-documento').apelido).toBe('Sumi');
  });

  it('equipe do projeto: cada posição é um agente; sessão sem posição usa o visual automático', async () => {
    api.listar.mockResolvedValue([agente({ alvo: 'PROJETO', chave: 'app', ordem: 1, nome: 'Lia' })]);
    const store = criar();
    await store.carregar();

    expect(store.visualSessao('app', 1, 'sessao-x').apelido).toBe('Lia');
    expect(store.visualSessao('app', 0, 'sessao-x').apelido).not.toBe('Lia');
    expect(store.visualSessao('outro', 1, 'sessao-x').apelido).not.toBe('Lia');
    expect(store.visualSessao(null, undefined, 'sessao-x').acessorio).toBe('NENHUM');
  });

  it('falha ao carregar não derruba o Escritório: guarda o erro e segue no padrão', async () => {
    api.listar.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = criar();
    await store.carregar();

    expect(store.erro()).toBeTruthy();
    expect(store.carregado()).toBe(true);
    expect(store.visualAutomacao('analisar-codigo').apelido).toBe('Bit');
  });
});
