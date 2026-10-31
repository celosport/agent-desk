// Só o que o Escritório usa dos DTOs do módulo Automacoes (mesmos nomes do JSON). Uma feature não importa a outra.

export interface AutomacaoAgente {
  automacaoId: string;
  codigo: string;
  nome: string;
  descricao: string;
  modeloId?: string;
}

export interface ExecucaoResumo {
  chamadaId: string;
  codigo: string;
  modeloUsado: string;
  truncado: boolean;
  tokens: { total: number };
  custoUsd: number;
  duracaoMs: number;
  iniciadaEm: string;
  /** Início + duração (a API calcula). */
  finalizadaEm: string;
  alertaLimite?: { percentual: number; atingido: boolean };
}
