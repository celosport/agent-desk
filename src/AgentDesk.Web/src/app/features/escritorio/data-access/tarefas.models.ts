// = DTOs de tarefas do módulo Sessoes da API (/api/v1/sessoes/computadores e /tarefas). Mesmos nomes do JSON.

/** EXPIRADA: ninguém buscou a tarefa em 10 min (o computador provavelmente está desligado). */
export type StatusTarefa = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'CANCELADA' | 'EXPIRADA';

/** Pasta que o usuário liberou NO PC (comando `liberar` do coletor). Só o nome e a chave: o caminho nunca sai do PC. */
export interface PastaLiberada {
  projetoChave: string;
  projeto: string;
}

export interface Computador {
  maquina: string;
  /** O coletor deu sinal nos últimos 45 s. */
  online: boolean;
  pastas: PastaLiberada[];
}

export interface Tarefa {
  /** É também o id da sessão do Claude Code: o robô dela aparece no Escritório. */
  tarefaId: string;
  maquina: string;
  projetoChave: string;
  projeto: string;
  texto: string;
  status: StatusTarefa;
  criadaEm: string;
  iniciadaEm?: string;
  finalizadaEm?: string;
  erro?: string;
}

export interface EnviarTarefa {
  maquina: string;
  projetoChave: string;
  texto: string;
}

export const TEXTO_MAXIMO_TAREFA = 4000;

export const ROTULO_STATUS_TAREFA: Record<StatusTarefa, string> = {
  PENDENTE: 'Esperando o computador',
  EM_ANDAMENTO: 'Rodando',
  CONCLUIDA: 'Concluída',
  FALHOU: 'Falhou',
  CANCELADA: 'Cancelada',
  EXPIRADA: 'Sem resposta do computador',
};
