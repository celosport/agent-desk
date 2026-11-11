import { TestBed } from '@angular/core/testing';
import { InicioApi } from './inicio.api';
import { InicioStore } from './inicio.store';

const zero = { chamadas: 0, tokens: 0, custoUsd: 0 };
const usoZero = { pedidos: 0, custoUsd: 0 };
const resumo = (chamadas = 0) => ({ hoje: zero, mes: zero, acumulado: { ...zero, chamadas }, dias: 14, porDia: [], ranking: [] });
const code = (pedidos = 0) => ({ hoje: usoZero, mes: usoZero, acumulado: { ...usoZero, pedidos }, serie: [], projetos: [] });

describe('InicioStore', () => {
  const api = { resumo: vi.fn(), painelClaudeCode: vi.fn(), dicas: vi.fn(), limites: vi.fn(), aoVivo: vi.fn(), configuracao: vi.fn() };
  const criar = () => {
    TestBed.configureTestingModule({ providers: [InicioStore, { provide: InicioApi, useValue: api }] });
    return TestBed.inject(InicioStore);
  };
  const tudoCerto = (chave = true, chamadas = 1, pedidos = 1) => {
    api.resumo.mockResolvedValue(resumo(chamadas));
    api.painelClaudeCode.mockResolvedValue(code(pedidos));
    api.dicas.mockResolvedValue({ dicas: [], economiaTotalUsd: 0 });
    api.limites.mockResolvedValue({});
    api.aoVivo.mockResolvedValue({ projetos: [] });
    api.configuracao.mockResolvedValue({ chaveApiConfigurada: chave });
  };
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('uma fonte que falha não derruba as outras (e não mostra erro)', async () => {
    tudoCerto();
    api.dicas.mockRejectedValue(new Error('x'));
    const s = criar();
    await s.atualizar();
    expect(s.resumo()).not.toBeNull();
    expect(s.dicas()).toBeNull();
    expect(s.erro()).toBeNull();
  });

  it('se nada carrega, mostra o aviso e propaga o erro para o polling esperar mais', async () => {
    Object.values(api).forEach((f) => f.mockRejectedValue(new Error('rede')));
    const s = criar();
    await expect(s.atualizar()).rejects.toThrow();
    expect(s.erro()).toContain('Não consegui');
  });

  it('primeiros passos: aparece sem chave, e some quando chave, Claude Code e automação estão feitos', async () => {
    tudoCerto(false, 0, 0);
    const s = criar();
    await s.atualizar();
    expect(s.mostrarPassos()).toBe(true);
    expect(s.passos().filter((p) => p.feito)).toHaveLength(0);

    tudoCerto(true, 2, 5);
    await s.atualizar();
    expect(s.mostrarPassos()).toBe(false);
  });

  it('Claude Code conectado também quando há sessão no ar, mesmo sem pedidos ainda', async () => {
    tudoCerto(true, 1, 0);
    api.aoVivo.mockResolvedValue({ projetos: [{ chave: 'a', nome: 'a', sessoes: [{ sessaoId: '1', status: 'TRABALHANDO' }] }] });
    const s = criar();
    await s.atualizar();
    expect(s.claudeCodeConectado()).toBe(true);
  });

  it('trocar o escopo limpa os números do escopo anterior e consulta de novo', async () => {
    tudoCerto();
    const s = criar();
    await s.atualizar();
    await s.trocarEscopo('TODOS');
    expect(api.resumo).toHaveBeenLastCalledWith('TODOS');
    expect(s.escopo()).toBe('TODOS');
  });
});
