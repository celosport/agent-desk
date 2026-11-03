// Funções puras que montam as salas do Escritório a partir do "ao vivo" da API (testadas em salas.spec.ts).
import { StatusSessao } from '../motor/sessao';
import { MAXIMO_AGENTES } from '../motor/personagens';
import { ProjetoAoVivo, SessaoAoVivo, SubagenteAoVivo } from './sessoes.models';

/** Uma sala: um projeto, ou vários projetos que o usuário juntou num grupo. */
export interface Sala extends ProjetoAoVivo {
  /** Os projetos (pastas) que formam a sala; mais de um quando é um grupo. */
  projetos: { chave: string; nome: string }[];
}

/** Quem aparece na cena: uma sessão ou um subagente dela. */
export interface Participante {
  codigo: string;
  status: StatusSessao;
  atividade: string | undefined;
  /** Preenchido nos robôs ajudantes (subagentes). */
  subagente?: { sessaoId: string; tipo: string };
}

export const PREFIXO_SUBAGENTE = 'sub:';
export const PREFIXO_GRUPO = 'g:';

export const codigoDoSubagente = (sessaoId: string, agenteId: string) => `${PREFIXO_SUBAGENTE}${sessaoId}:${agenteId}`;

/**
 * Projetos do mesmo grupo viram uma sala só (que fica no lugar do primeiro deles na lista). Cada sessão carrega a chave do
 * próprio projeto, que é o que liga o robô ao nome e à aparência salvos na Equipe.
 */
export function montarSalas(projetos: ProjetoAoVivo[]): Sala[] {
  const salas: Sala[] = [];
  const dosGrupos = new Map<string, Sala>();
  for (const p of projetos) {
    const sessoes = p.sessoes.map((s) => ({ ...s, projetoChave: s.projetoChave ?? p.chave }));
    if (!p.grupo) {
      salas.push({ chave: p.chave, nome: p.nome, sessoes, projetos: [{ chave: p.chave, nome: p.nome }] });
      continue;
    }
    const existente = dosGrupos.get(p.grupo);
    if (existente) {
      existente.sessoes = [...existente.sessoes, ...sessoes];
      existente.projetos = [...existente.projetos, { chave: p.chave, nome: p.nome }];
    } else {
      const sala: Sala = { chave: PREFIXO_GRUPO + p.grupo, nome: p.grupo, grupo: p.grupo, sessoes, projetos: [{ chave: p.chave, nome: p.nome }] };
      dosGrupos.set(p.grupo, sala);
      salas.push(sala);
    }
  }
  return salas;
}

/** Quem precisa de você aparece antes de quem trabalha, e quem trabalha antes de quem está parado. */
const PRIORIDADE: Record<StatusSessao, number> = { ESPERANDO_VOCE: 0, TRABALHANDO: 1, OCIOSA: 2, ENCERRADA: 3 };

/**
 * Quem entra na cena (no máximo `MAXIMO_AGENTES`). Sessões primeiro, depois os ajudantes delas, que só ficam com as mesas que
 * sobrarem. Cabendo todos, a ordem é a da API (não mexe em quem já está sentado); passando de 8, ficam os mais ativos — uma
 * sessão encerrada ou parada nunca tira o lugar de quem está trabalhando.
 */
export function participantesDaCena(sessoes: SessaoAoVivo[], maximo = MAXIMO_AGENTES): { naCena: Participante[]; fora: number } {
  const sessoesOrdenadas = sessoes.length > maximo ? escolherMaisAtivas(sessoes, maximo) : sessoes;
  const todos: Participante[] = sessoesOrdenadas.map((s) => ({ codigo: s.sessaoId, status: s.status, atividade: s.atividade }));
  const ajudantes: Participante[] = sessoesOrdenadas.flatMap((s) =>
    (s.subagentes ?? []).map((a: SubagenteAoVivo) => ({
      codigo: codigoDoSubagente(s.sessaoId, a.agenteId),
      status: a.status,
      atividade: a.atividade,
      subagente: { sessaoId: s.sessaoId, tipo: a.tipo },
    })),
  );
  const total = sessoes.length + sessoes.reduce((n, s) => n + (s.subagentes?.length ?? 0), 0);
  const naCena = [...todos, ...ajudantes].slice(0, maximo);
  return { naCena, fora: Math.max(0, total - naCena.length) };
}

function escolherMaisAtivas(sessoes: SessaoAoVivo[], maximo: number): SessaoAoVivo[] {
  const escolhidas = new Set(
    sessoes
      .map((s, i) => ({ s, i }))
      .sort((a, b) => PRIORIDADE[a.s.status] - PRIORIDADE[b.s.status] || a.i - b.i)
      .slice(0, maximo)
      .map((x) => x.s),
  );
  return sessoes.filter((s) => escolhidas.has(s)); // volta à ordem da API
}

/** Salas de projetos diferentes com o mesmo nome de pasta e fora de qualquer grupo (candidatas a "juntar"). */
export function projetosHomonimos(salas: Sala[], sala: Sala): { chave: string; nome: string }[] {
  if (sala.grupo) return [];
  const mesmoNome = salas.filter((o) => !o.grupo && o.chave !== sala.chave && o.nome === sala.nome);
  return mesmoNome.map((o) => ({ chave: o.chave, nome: o.nome }));
}
