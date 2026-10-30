// Modelos = DTOs do módulo Tarefas da API (src/Modules/Tarefas/.../Application/DTOs/TarefaDtos.cs).
// Mantenha os nomes iguais ao JSON (camelCase; enums em SNAKE_CASE_UPPER; nulos omitidos).

export type StatusTarefa = 'PENDENTE' | 'CONCLUIDA';

export interface Tarefa {
  tarefaId: string;
  titulo: string;
  status: StatusTarefa;
  criadaEm: string;
  concluidaEm?: string;
}

export interface CriarTarefaRequest {
  titulo: string;
}
