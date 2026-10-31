// = DTOs do painel do Claude Code (GET /api/v1/sessoes/painel). Mesmos nomes do JSON; enums em SNAKE_CASE_UPPER.

export type EscopoClaudeCode = 'MEU' | 'TODOS';

export interface UsoClaudeCode {
  pedidos: number;
  /** Entrada + saída + cache (leitura e escrita). */
  tokens: number;
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
  /** Quanto custaria na API (a assinatura não cobra por token). */
  custoUsd: number;
  /** De 0 a 1 (leitura ÷ contexto); ausente se não houve contexto. */
  taxaCache?: number;
  /** Cache abaixo de 60% com pelo menos 5 pedidos. */
  cacheBaixo: boolean;
}

export interface DiaClaudeCode {
  /** Dia de Brasília: "2026-10-30". */
  dia: string;
  uso: UsoClaudeCode;
}

/** Projeto ou modelo. */
export interface ItemClaudeCode {
  nome: string;
  uso: UsoClaudeCode;
}

export interface FerramentaUso {
  ferramenta: string;
  usos: number;
}

export interface PainelClaudeCode {
  escopo: EscopoClaudeCode;
  hoje: UsoClaudeCode;
  mes: UsoClaudeCode;
  acumulado: UsoClaudeCode;
  dias: number;
  serie: DiaClaudeCode[];
  projetos: ItemClaudeCode[];
  modelos: ItemClaudeCode[];
  ferramentas: FerramentaUso[];
  atualizadoEm: string;
}
