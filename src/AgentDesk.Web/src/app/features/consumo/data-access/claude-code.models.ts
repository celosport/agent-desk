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

export interface Dica {
  /** Código estável da regra: CACHE_BAIXO, SESSAO_GIGANTE, MUITAS_COMPACTACOES, MODELO_CARO, DIA_FORA_DA_CURVA. */
  regra: string;
  titulo: string;
  texto: string;
  projeto?: string;
  sessaoId?: string;
  /** Estimativa grosseira (US$ na API), nunca uma promessa. */
  economiaUsd: number;
}

export interface Dicas {
  dicas: Dica[];
  /** Soma das estimativas: um teto otimista (as dicas se sobrepõem). */
  economiaTotalUsd: number;
  dias: number;
}

export type StatusSessao = 'TRABALHANDO' | 'ESPERANDO_VOCE' | 'OCIOSA' | 'ENCERRADA';

export interface SessaoHistorico {
  sessaoId: string;
  usuarioId: string;
  /** Só no escopo TODOS. */
  usuarioNome?: string;
  maquina: string;
  projeto: string;
  projetoChave: string;
  modelo?: string;
  status: StatusSessao;
  uso: UsoClaudeCode;
  iniciadaEm: string;
  ultimaAtividadeEm: string;
  encerradaEm?: string;
  /** Da primeira à última atividade (ou ao encerramento). */
  duracaoMs: number;
}

export interface ProjetoOpcao {
  chave: string;
  nome: string;
}

export interface PaginaHistoricoSessoes {
  itens: SessaoHistorico[];
  total: number;
  pagina: number;
  tamanho: number;
  projetos: ProjetoOpcao[];
}

export interface EventoLinha {
  ocorridoEm: string;
  /** Nome do hook (SessionStart, PreToolUse, Stop…) ou "api_request" (chamada ao modelo, com tokens e custo). */
  tipo: string;
  ferramenta?: string;
  resumo?: string;
  modelo?: string;
  tokens?: number;
  custoUsd?: number;
}

export interface LinhaDoTempo {
  sessao: SessaoHistorico;
  eventos: EventoLinha[];
  /** Havia mais eventos que o limite (1.000): o fim foi cortado. */
  cortada: boolean;
}

export interface FiltroHistoricoSessoes {
  escopo: EscopoClaudeCode;
  /** Chave do projeto ("" = todos). */
  projeto: string;
  /** Datas "AAAA-MM-DD" de Brasília ("" = sem limite). */
  de: string;
  ate: string;
  pagina: number;
  tamanho: number;
}

export interface JanelaUso {
  /** De 0 a 100. */
  percentual: number;
  renovaEm: string;
}

/** As janelas da assinatura que a statusline do Claude Code informou (Pro/Max). Uma janela que já renovou não vem. */
export interface LimitesAssinatura {
  cincoHoras?: JanelaUso;
  semana?: JanelaUso;
  atualizadoEm?: string;
}
