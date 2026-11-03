import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { EquipeApi } from './equipe.api';
import { EquipeStore } from './equipe.store';
import { SessoesApi } from './sessoes.api';
import { AoVivo, SessaoAoVivo } from './sessoes.models';
import { SessoesStore } from './sessoes.store';

describe('SessoesStore', () => {
  const api = { aoVivo: vi.fn(), parar: vi.fn(), decidir: vi.fn(), definirGrupo: vi.fn() };
  const apiEquipe = { listar: vi.fn().mockResolvedValue([]), salvar: vi.fn(), restaurar: vi.fn() };
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
    TestBed.configureTestingModule({ providers: [SessoesStore, EquipeStore, { provide: SessoesApi, useValue: api }, { provide: EquipeApi, useValue: apiEquipe }] });
    const store = TestBed.inject(SessoesStore);
    store.agora = () => 0;
    store.reduzido = true;
    return store;
  };

  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
  });

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

  it('a equipe do projeto vale pelo lugar do robô na sala; sem equipe, o nome automático', async () => {
    apiEquipe.listar.mockResolvedValueOnce([
      { alvo: 'PROJETO', chave: 'chave-app', ordem: 0, nome: 'Zeca', corCabeca: '#111111', corCorpo: '#222222', corDetalhe: '#333333', corOlhos: '#444444',
        acessorio: 'COROA', antena: 'DUPLA', expressao: 'FELIZ', atualizadoEm: '2026-10-31T12:00:00Z' },
    ]);
    api.aoVivo.mockResolvedValue(aoVivo(['app', [sessao('a', 'TRABALHANDO'), sessao('b', 'TRABALHANDO')]]));
    const store = criar();
    await TestBed.inject(EquipeStore).carregar();
    await store.atualizar();

    expect(store.apelido('a')).toBe('Zeca'); // a 1ª a chegar usa o agente de ordem 0
    expect(store.visualDe('a').acessorio).toBe('COROA');
    expect(store.apelido('b')).not.toBe('Zeca'); // a 2ª não tem agente configurado
    expect(store.visualDe('b').acessorio).toBe('NENHUM');
  });

  describe('nome e aparência seguem o lugar da sessão no servidor, não a ordem de chegada', () => {
    const equipeDoLugar = (ordem: number, nome: string, acessorio = 'COROA') => ({
      alvo: 'PROJETO', chave: 'chave-app', ordem, nome, corCabeca: '#111111', corCorpo: '#222222', corDetalhe: '#333333', corOlhos: '#444444',
      acessorio, antena: 'DUPLA', expressao: 'FELIZ', atualizadoEm: '2026-10-31T12:00:00Z',
    });

    it('a sessão que chegou depois, mas ficou com o lugar 0, é quem usa o agente 1 — mesmo depois de recarregar', async () => {
      apiEquipe.listar.mockResolvedValueOnce([equipeDoLugar(0, 'Zeca'), equipeDoLugar(1, 'Bia', 'OCULOS')]);
      // A API lista "b" antes de "a", mas "a" tem o lugar 0: o nome salvo não pode trocar de dono
      const lista = [sessao('b', 'TRABALHANDO'), sessao('a', 'TRABALHANDO')].map((s, i) => ({ ...s, lugar: i === 0 ? 1 : 0 }));
      api.aoVivo.mockResolvedValue(aoVivo(['app', lista]));
      const store = criar();
      await TestBed.inject(EquipeStore).carregar();
      await store.atualizar();

      expect(store.apelido('a')).toBe('Zeca');
      expect(store.apelido('b')).toBe('Bia');
      expect(store.agenteDaSessao('a')).toEqual({ alvo: 'PROJETO', chave: 'chave-app', ordem: 0 });

      await store.atualizar(); // o polling seguinte (ou recarregar a página) não muda quem é quem
      expect(store.apelido('a')).toBe('Zeca');
    });

    it('numa sala de grupo, cada robô continua com a equipe do projeto dele', async () => {
      apiEquipe.listar.mockResolvedValueOnce([equipeDoLugar(0, 'Zeca')]);
      const loja = { chave: 'chave-loja', nome: 'loja', grupo: 'Tudo', sessoes: [{ ...sessao('l', 'TRABALHANDO'), lugar: 0 }] };
      const app = { chave: 'chave-app', nome: 'app', grupo: 'Tudo', sessoes: [{ ...sessao('a', 'TRABALHANDO'), lugar: 0 }] };
      api.aoVivo.mockResolvedValue({ projetos: [loja, app], atualizadoEm: '' });
      const store = criar();
      await TestBed.inject(EquipeStore).carregar();
      await store.atualizar();

      expect(store.projeto()?.chave).toBe('g:Tudo');
      expect(store.agentes.map((x) => x.codigo)).toEqual(['l', 'a']);
      expect(store.apelido('a')).toBe('Zeca'); // lugar 0 do projeto "app"
      expect(store.apelido('l')).not.toBe('Zeca'); // o lugar 0 do projeto "loja" não tem agente salvo
      expect(store.agenteDaSessao('a')).toEqual({ alvo: 'PROJETO', chave: 'chave-app', ordem: 0 });
    });
  });

  describe('ajudantes (subagentes)', () => {
    const ajudante = (agenteId: string, tipo: string, status: 'TRABALHANDO' | 'ENCERRADA' = 'TRABALHANDO') =>
      ({ agenteId, tipo, status, atividade: '🔎 Procurando “x”', iniciadoEm: '2026-10-30T12:00:00Z', ultimaAtividadeEm: '2026-10-30T12:00:00Z' });

    it('cada subagente vira um robô na mesa que sobrou, com o tipo como nome, e some quando termina', async () => {
      api.aoVivo.mockResolvedValueOnce(aoVivo(['app', [{ ...sessao('a', 'TRABALHANDO'), subagentes: [ajudante('x', 'Explore'), ajudante('y', 'Plan')] }]]));
      const store = criar();
      await store.atualizar();

      expect(store.agentes.map((x) => x.codigo)).toEqual(['a', 'sub:a:x', 'sub:a:y']);
      expect(store.apelido('sub:a:x')).toBe('Explore');
      expect(store.visualDe('sub:a:x').antena).toBe('BOLINHA');
      expect(store.agentes[1].balao?.texto).toBe('🔎 Procurando “x”');
      expect(store.ajudantesAtivos()).toBe(2);
      expect(store.agenteDaSessao('sub:a:x')).toBeNull(); // ajudante não se personaliza (o nome é o tipo)
      expect(store.descricao()).toContain('ajudantes: Explore, 🔎 Procurando “x”; Plan');

      api.aoVivo.mockResolvedValueOnce(aoVivo(['app', [{ ...sessao('a', 'TRABALHANDO'), subagentes: [ajudante('y', 'Plan')] }]]));
      await store.atualizar();
      expect(store.agentes.map((x) => x.codigo)).toEqual(['a', 'sub:a:y']);
      expect(store.ajudantesAtivos()).toBe(1);
    });

    it('com a sala cheia de sessões, os ajudantes não tiram a mesa de ninguém', async () => {
      const sessoes = Array.from({ length: 8 }, (_, i) => ({ ...sessao(`s${i}`, 'TRABALHANDO'), subagentes: i === 0 ? [ajudante('x', 'Explore')] : [] }));
      api.aoVivo.mockResolvedValueOnce(aoVivo(['app', sessoes]));
      const store = criar();
      await store.atualizar();

      expect(store.agentes).toHaveLength(8);
      expect(store.agentes.some((x) => x.codigo.startsWith('sub:'))).toBe(false);
      expect(store.foraDaSala()).toBe(1);
    });
  });

  describe('grupos de salas', () => {
    it('juntar projetos de um grupo mostra uma sala só; agrupar chama a API e vai para a sala do grupo', async () => {
      api.aoVivo.mockResolvedValueOnce(aoVivo(['loja', [sessao('l', 'TRABALHANDO')]], ['app', [sessao('a', 'TRABALHANDO')]]));
      const store = criar();
      await store.atualizar();
      expect(store.projetos()).toHaveLength(2);

      api.definirGrupo.mockResolvedValue(undefined);
      api.aoVivo.mockResolvedValueOnce({
        projetos: [
          { chave: 'chave-loja', nome: 'loja', grupo: 'Tudo', sessoes: [sessao('l', 'TRABALHANDO')] },
          { chave: 'chave-app', nome: 'app', grupo: 'Tudo', sessoes: [sessao('a', 'TRABALHANDO')] },
        ],
        atualizadoEm: '',
      });
      await store.agrupar('chave-app', 'Tudo');

      expect(api.definirGrupo).toHaveBeenCalledWith('chave-app', 'Tudo');
      expect(store.projetos().map((s) => s.chave)).toEqual(['g:Tudo']);
      expect(store.projeto()?.nome).toBe('Tudo');
      expect(store.sessoes()).toHaveLength(2);
      expect(store.grupos()).toEqual(['Tudo']);
    });

    it('tirar o projeto do grupo volta para a sala dele; erro do servidor vira mensagem', async () => {
      api.aoVivo.mockResolvedValueOnce({ projetos: [{ chave: 'chave-app', nome: 'app', grupo: 'Tudo', sessoes: [sessao('a', 'TRABALHANDO')] }], atualizadoEm: '' });
      const store = criar();
      await store.atualizar();
      expect(store.projeto()?.chave).toBe('g:Tudo');

      api.definirGrupo.mockResolvedValue(undefined);
      api.aoVivo.mockResolvedValueOnce(aoVivo(['app', [sessao('a', 'TRABALHANDO')]]));
      await store.agrupar('chave-app', null);
      expect(store.projeto()?.chave).toBe('chave-app');

      api.definirGrupo.mockRejectedValueOnce(new HttpErrorResponse({ status: 409, error: { code: 'Sessoes.LimiteDeGrupos', title: 'Você já agrupou 100 salas.' } }));
      await store.agrupar('chave-app', 'X');
      expect(store.erroControle()).toBe('Você já agrupou 100 salas.');
    });

    it('sugere juntar salas de outra pasta com o mesmo nome', async () => {
      api.aoVivo.mockResolvedValueOnce({
        projetos: [
          { chave: 'c1', nome: 'api', sessoes: [sessao('a', 'TRABALHANDO')] },
          { chave: 'c2', nome: 'api', sessoes: [sessao('b', 'OCIOSA')] },
        ],
        atualizadoEm: '',
      });
      const store = criar();
      await store.atualizar();

      expect(store.homonimas()).toEqual([{ chave: 'c2', nome: 'api' }]);
    });
  });

  it('falha no polling mostra o erro e propaga (o polling espera mais)', async () => {
    api.aoVivo.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    const store = criar();
    await expect(store.atualizar()).rejects.toBeTruthy();
    expect(store.erro()).toContain('Sem conexão');
  });

  describe('controle: Parar e Aprovar/Negar', () => {
    const comPermissao = (sessaoId: string): SessaoAoVivo => ({
      ...sessao(sessaoId, 'ESPERANDO_VOCE', '✋ Precisa de você'),
      permissaoPendente: { permissaoId: 'perm-1', ferramenta: 'Bash', resumo: 'npm test', criadaEm: '2026-10-31T12:00:00Z', expiraEm: '2026-10-31T12:00:55Z' },
    });

    it('junta os pedidos de permissão de todas as salas e avisa quem pede (uma vez só)', async () => {
      api.aoVivo.mockResolvedValue(aoVivo(['loja', [comPermissao('a')]], ['app', [sessao('b', 'TRABALHANDO')]]));
      const store = criar();
      await store.atualizar();

      expect(store.permissoes()).toHaveLength(1);
      expect(store.permissoes()[0]).toMatchObject({ sessaoId: 'a', projeto: 'loja', permissao: { ferramenta: 'Bash', resumo: 'npm test' } });
      expect(store.anuncio()).toContain('pede permissão para usar Bash: npm test');

      store.anuncio.set('');
      await store.atualizar(); // o mesmo pedido de novo (polling): não repete o aviso
      expect(store.anuncio()).toBe('');
    });

    it('Aprovar e Negar mandam a decisão e atualizam a lista na hora', async () => {
      api.aoVivo.mockResolvedValueOnce(aoVivo(['app', [comPermissao('a')]]));
      const store = criar();
      await store.atualizar();
      api.decidir.mockResolvedValue(undefined);
      api.aoVivo.mockResolvedValueOnce(aoVivo(['app', [sessao('a', 'TRABALHANDO')]])); // depois de decidir, o pedido sumiu

      await store.decidir('perm-1', 'APROVAR');

      expect(api.decidir).toHaveBeenCalledWith('perm-1', 'APROVAR');
      expect(store.permissoes()).toEqual([]);
      expect(store.erroControle()).toBeNull();
    });

    it('pedido que já venceu (404) mostra o erro do servidor e a lista segue atualizada', async () => {
      api.aoVivo.mockResolvedValue(aoVivo(['app', [sessao('a', 'TRABALHANDO')]]));
      const store = criar();
      await store.atualizar();
      api.decidir.mockRejectedValue(
        new HttpErrorResponse({ status: 404, error: { code: 'Sessoes.PermissaoNaoEncontrada', title: 'Este pedido de permissão não existe mais.' } }),
      );

      await store.decidir('perm-velha', 'NEGAR');

      expect(store.erroControle()).toBe('Este pedido de permissão não existe mais.');
    });

    it('Parar pede a parada da sessão e relê o estado; falha vira mensagem', async () => {
      api.aoVivo.mockResolvedValue(aoVivo(['app', [sessao('a', 'TRABALHANDO')]]));
      const store = criar();
      await store.atualizar();
      api.parar.mockResolvedValueOnce(undefined);

      await store.parar('a');
      expect(api.parar).toHaveBeenCalledWith('a');
      expect(api.aoVivo).toHaveBeenCalledTimes(2);

      api.parar.mockRejectedValueOnce(new HttpErrorResponse({ status: 404, error: { code: 'Sessoes.SessaoNaoEncontrada', title: 'Sessão não encontrada.' } }));
      await store.parar('a');
      expect(store.erroControle()).toBe('Sessão não encontrada.');
    });
  });
});
