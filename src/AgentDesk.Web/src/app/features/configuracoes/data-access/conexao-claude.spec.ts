import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ConexaoClaudeApi, ConexaoClaudeStore, comandosDeAtualizacao, comandosDeInstalacao } from './conexao-claude';

describe('conexão do Claude Code', () => {
  it('comandos de instalação para Windows e macOS/Linux, com URL e token', () => {
    const c = comandosDeInstalacao('https://app.exemplo.com/', 'https://app.exemplo.com', 'adk_abc', 'Note "do" $trabalho');
    expect(c.windows).toContain('Invoke-WebRequest "https://app.exemplo.com/coletor/agentdesk-coletor.mjs"');
    expect(c.windows).toContain('instalar --url "https://app.exemplo.com" --token "adk_abc" --maquina "Note do trabalho"');
    expect(c.unix).toMatch(/^mkdir -p ~\/\.agentdesk && curl -fsSL "https:\/\/app\.exemplo\.com\/coletor\/agentdesk-coletor\.mjs"/);
    expect(c.unix).toContain('--token "adk_abc"');
    expect(comandosDeInstalacao('http://a', 'http://a', 't', '  ').unix).toContain('--maquina "Computador"');
  });

  it('o segredo fica só até esconder; revogar o recém-criado também esconde', async () => {
    const api = { listar: vi.fn().mockResolvedValue([]), criar: vi.fn(), revogar: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({ providers: [ConexaoClaudeStore, { provide: ConexaoClaudeApi, useValue: api }] });
    const store = TestBed.inject(ConexaoClaudeStore);
    const token = { tokenId: 't1', nome: 'Notebook', prefixo: 'adk_123', criadoEm: '2026-10-30T12:00:00Z' };
    api.criar.mockResolvedValue({ token, segredo: 'adk_segredo' });

    expect(await store.criar('Notebook')).toBeNull();
    expect(store.criado()?.segredo).toBe('adk_segredo');
    expect(store.tokens()).toEqual([token]);

    await store.revogar('t1');
    expect(store.criado()).toBeNull();

    api.criar.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'Sessoes.LimiteDeTokens', title: 'Você já tem 10 tokens ativos.' } }));
    expect(await store.criar('Mais um')).toBe('Você já tem 10 tokens ativos.');
  });

  it('comando de atualização baixa o coletor e roda "atualizar", sem token', () => {
    const c = comandosDeAtualizacao('https://app.exemplo.com/');
    expect(c.unix).toBe('curl -fsSL "https://app.exemplo.com/coletor/agentdesk-coletor.mjs" -o ~/.agentdesk/agentdesk-coletor.mjs && node ~/.agentdesk/agentdesk-coletor.mjs atualizar');
    expect(c.windows).toContain('Invoke-WebRequest "https://app.exemplo.com/coletor/agentdesk-coletor.mjs"');
    expect(c.windows.endsWith('agentdesk-coletor.mjs" atualizar')).toBe(true);
    expect(c.windows + c.unix).not.toContain('adk_');
  });
});
