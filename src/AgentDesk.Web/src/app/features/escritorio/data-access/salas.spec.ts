import { codigoDoSubagente, montarSalas, participantesDaCena, projetosHomonimos } from './salas';
import { ProjetoAoVivo, SessaoAoVivo } from './sessoes.models';

const sessao = (sessaoId: string, status: SessaoAoVivo['status'], extra: Partial<SessaoAoVivo> = {}): SessaoAoVivo => ({
  sessaoId,
  maquina: 'Notebook',
  status,
  tokens: 0,
  tokensCacheLeitura: 0,
  custoUsd: 0,
  pedidos: 0,
  iniciadaEm: '2026-10-30T12:00:00Z',
  ultimaAtividadeEm: '2026-10-30T12:00:00Z',
  ...extra,
});
const projeto = (chave: string, nome: string, sessoes: SessaoAoVivo[], grupo?: string): ProjetoAoVivo => ({ chave, nome, sessoes, grupo });

describe('montarSalas', () => {
  it('sem grupo, cada projeto é uma sala; a sessão ganha a chave do projeto dela', () => {
    const salas = montarSalas([projeto('a', 'loja', [sessao('s1', 'OCIOSA')]), projeto('b', 'app', [sessao('s2', 'OCIOSA')])]);

    expect(salas.map((s) => s.chave)).toEqual(['a', 'b']);
    expect(salas[0].sessoes[0].projetoChave).toBe('a');
    expect(salas[0].grupo).toBeUndefined();
  });

  it('projetos do mesmo grupo viram uma sala só, no lugar do primeiro, e cada sessão guarda o próprio projeto', () => {
    const salas = montarSalas([
      projeto('a', 'loja', [sessao('s1', 'TRABALHANDO')], 'Loja'),
      projeto('x', 'outra', [sessao('sx', 'OCIOSA')]),
      projeto('b', 'loja-wt', [sessao('s2', 'TRABALHANDO'), sessao('s3', 'OCIOSA')], 'Loja'),
    ]);

    expect(salas.map((s) => s.chave)).toEqual(['g:Loja', 'x']);
    const grupo = salas[0];
    expect(grupo.nome).toBe('Loja');
    expect(grupo.sessoes.map((s) => [s.sessaoId, s.projetoChave])).toEqual([['s1', 'a'], ['s2', 'b'], ['s3', 'b']]);
    expect(grupo.projetos).toEqual([{ chave: 'a', nome: 'loja' }, { chave: 'b', nome: 'loja-wt' }]);
  });

  it('mantém a chave de projeto que o servidor já mandou na sessão', () => {
    const [sala] = montarSalas([projeto('a', 'loja', [sessao('s1', 'OCIOSA', { projetoChave: 'origem' })], 'G')]);
    expect(sala.sessoes[0].projetoChave).toBe('origem');
  });
});

describe('participantesDaCena', () => {
  it('cabendo todos, mantém a ordem da API e põe os ajudantes depois das sessões', () => {
    const { naCena, fora } = participantesDaCena([
      sessao('a', 'OCIOSA'),
      sessao('b', 'TRABALHANDO', { subagentes: [{ agenteId: 'x', tipo: 'Explore', status: 'TRABALHANDO', atividade: '🔎 Procurando', iniciadoEm: '', ultimaAtividadeEm: '' }] }),
    ]);

    expect(naCena.map((p) => p.codigo)).toEqual(['a', 'b', codigoDoSubagente('b', 'x')]);
    expect(naCena[2].subagente).toEqual({ sessaoId: 'b', tipo: 'Explore' });
    expect(naCena[2].atividade).toBe('🔎 Procurando');
    expect(fora).toBe(0);
  });

  it('passando de 8, quem trabalha ou espera por você fica; encerrada e parada saem primeiro', () => {
    const paradas = Array.from({ length: 8 }, (_, i) => sessao(`p${i}`, i % 2 ? 'ENCERRADA' : 'OCIOSA'));
    const { naCena, fora } = participantesDaCena([...paradas, sessao('t', 'TRABALHANDO'), sessao('e', 'ESPERANDO_VOCE')]);

    const ids = naCena.map((p) => p.codigo);
    expect(ids).toHaveLength(8);
    expect(ids).toContain('t');
    expect(ids).toContain('e');
    for (const ociosa of ['p0', 'p2', 'p4', 'p6']) expect(ids).toContain(ociosa); // as paradas vêm antes das encerradas
    expect(ids.filter((id) => ['p1', 'p3', 'p5', 'p7'].includes(id))).toHaveLength(2); // só 2 das 4 encerradas couberam
    expect(fora).toBe(2);
  });

  it('ajudantes só ficam com as mesas que sobram; o resto conta como fora da sala', () => {
    const ajudante = (n: number) => ({ agenteId: `a${n}`, tipo: 'Explore', status: 'TRABALHANDO' as const, iniciadoEm: '', ultimaAtividadeEm: '' });
    const sessoes = Array.from({ length: 7 }, (_, i) => sessao(`s${i}`, 'TRABALHANDO', i === 0 ? { subagentes: [ajudante(1), ajudante(2), ajudante(3)] } : {}));

    const { naCena, fora } = participantesDaCena(sessoes);

    expect(naCena).toHaveLength(8);
    expect(naCena.filter((p) => p.subagente)).toHaveLength(1);
    expect(fora).toBe(2);
  });
});

describe('projetosHomonimos', () => {
  it('acha salas de outras pastas com o mesmo nome, fora de grupos', () => {
    const salas = montarSalas([projeto('a', 'api', []), projeto('b', 'api', []), projeto('c', 'api', [], 'G'), projeto('d', 'web', [])]);

    expect(projetosHomonimos(salas, salas[0])).toEqual([{ chave: 'b', nome: 'api' }]);
    expect(projetosHomonimos(salas, salas[3])).toEqual([]);
    expect(projetosHomonimos(salas, salas[2])).toEqual([]); // quem já está num grupo não recebe a sugestão
  });
});
