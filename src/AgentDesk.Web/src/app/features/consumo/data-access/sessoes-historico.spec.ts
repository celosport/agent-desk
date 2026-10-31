import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ClaudeCodeApi } from './claude-code.api';
import { EventoLinha, LinhaDoTempo, PaginaHistoricoSessoes, SessaoHistorico } from './claude-code.models';
import { HistoricoSessoesStore } from './historico-sessoes.store';
import { agruparPorHora, descreverEvento } from './sessoes-historico.util';

const ev = (ocorridoEm: string, tipo: string, extra: Partial<EventoLinha> = {}): EventoLinha => ({ ocorridoEm, tipo, ...extra });
const uso = { pedidos: 1, tokens: 1, entrada: 1, saida: 0, cacheLeitura: 0, cacheEscrita: 0, custoUsd: 0, cacheBaixo: false };
const sessao = (sessaoId: string): SessaoHistorico => ({
  sessaoId, usuarioId: 'u1', maquina: 'N', projeto: 'agent-desk', projetoChave: 'aaa', status: 'ENCERRADA', uso,
  iniciadaEm: '2026-10-31T15:00:00Z', ultimaAtividadeEm: '2026-10-31T16:00:00Z', duracaoMs: 3_600_000,
});

describe('linha do tempo', () => {
  it('descreve cada tipo de evento em português e esconde o ruído do pós-ferramenta', () => {
    expect(descreverEvento(ev('2026-10-31T15:00:00Z', 'PreToolUse', { ferramenta: 'Read', resumo: 'api.ts' }))).toBe('Read: api.ts');
    expect(descreverEvento(ev('2026-10-31T15:00:00Z', 'PreToolUse'))).toBe('Usou uma ferramenta');
    expect(descreverEvento(ev('2026-10-31T15:00:00Z', 'PostToolUse', { ferramenta: 'Read' }))).toBeNull();
    expect(descreverEvento(ev('2026-10-31T15:00:00Z', 'PreCompact'))).toBe('Compactou o contexto');
    expect(descreverEvento(ev('2026-10-31T15:00:00Z', 'PostToolUseFailure', { ferramenta: 'Bash' }))).toBe('Falhou: Bash');
    const api = descreverEvento(ev('2026-10-31T15:00:00Z', 'api_request', { modelo: 'claude-opus-5-5', tokens: 12_400, custoUsd: 0.21 }))!;
    expect(api.replace(/\s/g, ' ')).toBe('Chamada ao modelo · claude-opus-5-5 · 12.400 tokens · ≈ US$ 0,21');
    expect(descreverEvento(ev('2026-10-31T15:00:00Z', 'TipoNovo'))).toBe('TipoNovo');
  });

  it('agrupa hora a hora no horário de Brasília, na ordem, sem os eventos escondidos', () => {
    const grupos = agruparPorHora([
      ev('2026-10-31T15:00:05Z', 'SessionStart'), // 12:00 em Brasília
      ev('2026-10-31T15:30:00Z', 'PostToolUse'),
      ev('2026-10-31T15:59:59Z', 'Stop'),
      ev('2026-10-31T16:00:00Z', 'PreCompact'), // 13:00
    ]);

    expect(grupos.map((g) => g.rotulo)).toEqual(['12h', '13h']);
    expect(grupos[0].itens).toEqual([
      { hora: '12:00:05', texto: 'Sessão aberta', tipo: 'SessionStart' },
      { hora: '12:59:59', texto: 'Terminou a resposta', tipo: 'Stop' },
    ]);
    expect(grupos[1].itens[0].texto).toBe('Compactou o contexto');
  });
});

describe('HistoricoSessoesStore', () => {
  const api = { historico: vi.fn(), linhaDoTempo: vi.fn() };
  const pagina = (total: number, itens: SessaoHistorico[] = [sessao('a')]): PaginaHistoricoSessoes => ({ itens, total, pagina: 1, tamanho: 20, projetos: [] });

  const criar = () => {
    TestBed.configureTestingModule({ providers: [HistoricoSessoesStore, { provide: ClaudeCodeApi, useValue: api }] });
    return TestBed.inject(HistoricoSessoesStore);
  };

  beforeEach(() => {
    api.historico.mockReset();
    api.linhaDoTempo.mockReset();
  });

  it('carrega a primeira página e calcula o total de páginas', async () => {
    api.historico.mockResolvedValue(pagina(45));
    const store = criar();
    await store.carregar();

    expect(store.pagina()?.total).toBe(45);
    expect(store.totalPaginas()).toBe(3);
    expect(api.historico).toHaveBeenCalledWith(expect.objectContaining({ escopo: 'MEU', pagina: 1, tamanho: 20 }));
  });

  it('filtrar volta para a página 1 e fecha a sessão aberta; ir para a página respeita os limites', async () => {
    api.historico.mockResolvedValue(pagina(45));
    api.linhaDoTempo.mockResolvedValue({ sessao: sessao('a'), eventos: [], cortada: false } satisfies LinhaDoTempo);
    const store = criar();
    await store.carregar();
    await store.abrir(sessao('a'));
    expect(store.linha()).not.toBeNull();

    await store.irParaPagina(3);
    expect(store.filtro().pagina).toBe(3);
    await store.irParaPagina(99);
    expect(store.filtro().pagina).toBe(3); // limitado ao total de páginas
    await store.filtrar({ projeto: 'aaa' });
    expect(store.filtro()).toMatchObject({ projeto: 'aaa', pagina: 1 });
    expect(store.linha()).toBeNull();
  });

  it('abrir a sessão pede a linha do tempo no escopo atual; erro vira mensagem sem derrubar a lista', async () => {
    api.historico.mockResolvedValue(pagina(1));
    const store = criar();
    await store.trocarEscopo('TODOS');
    api.linhaDoTempo.mockRejectedValueOnce(new HttpErrorResponse({ status: 404, error: { code: 'Sessoes.NaoEncontrada', title: 'Sessão não encontrada.' } }));

    await store.abrir(sessao('x'));

    expect(api.linhaDoTempo).toHaveBeenCalledWith('x', 'TODOS');
    expect(store.erroLinha()).toBe('Sessão não encontrada.');
    expect(store.pagina()).not.toBeNull();
  });

  it('erro ao carregar mostra a mensagem', async () => {
    api.historico.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = criar();
    await store.carregar();

    expect(store.erro()).toContain('Sem conexão');
    expect(store.carregando()).toBe(false);
  });
});
