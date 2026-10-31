// Modelos = DTOs do módulo Consumo da API (src/Modules/Consumo/.../Application/DTOs/ConsumoDtos.cs).
// Mantenha os nomes iguais ao JSON (camelCase; enums em SNAKE_CASE_UPPER; nulos omitidos).

/** MEU = só o usuário logado; TODOS = soma de todos os usuários (só ADMIN). */
export type EscopoConsumo = 'MEU' | 'TODOS';
export type StatusChamada = 'SUCESSO' | 'ERRO' | 'RECUSADA' | 'CANCELADA';

export interface Totais {
  chamadas: number;
  tokens: number;
  custoUsd: number;
}

export interface ConsumoDia extends Totais {
  /** Dia de Brasília: "2026-10-30". */
  dia: string;
}

export interface RankingAutomacao extends Totais {
  automacaoId?: string;
  nome: string;
}

export interface ResumoConsumo {
  escopo: EscopoConsumo;
  hoje: Totais;
  mes: Totais;
  acumulado: Totais;
  dias: number;
  porDia: ConsumoDia[];
  ranking: RankingAutomacao[];
  limiteMensalUsd?: number;
  percentualLimite?: number;
  atualizadoEm: string;
}

export interface Tokens {
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
  total: number;
}

export interface Chamada {
  chamadaId: string;
  iniciadaEm: string;
  /** Só no escopo TODOS. */
  usuarioNome?: string;
  automacaoId?: string;
  automacaoNome?: string;
  modeloId: string;
  modeloUsado?: string;
  tokens: Tokens;
  custoUsd: number;
  duracaoMs: number;
  /** Início + duração (a API calcula). */
  finalizadaEm: string;
  status: StatusChamada;
  erroCodigo?: string;
  motivoParada?: string;
  nomeArquivo?: string;
  temResultado: boolean;
}

export interface ChamadaDetalhe {
  chamada: Chamada;
  resultado?: string;
  precoEntradaMTok?: number;
  precoSaidaMTok?: number;
  precoCacheLeituraMTok?: number;
  precoCacheEscritaMTok?: number;
}

export interface PaginaChamadas {
  itens: Chamada[];
  total: number;
  pagina: number;
  tamanho: number;
  totais: Totais;
}

export interface FiltrosConsumo {
  automacoes: { automacaoId: string; nome: string }[];
  modelos: string[];
}

/** Filtros do histórico como a tela guarda (strings vazias = sem filtro). Datas "AAAA-MM-DD" (dia de Brasília). */
export interface FiltroHistorico {
  escopo: EscopoConsumo;
  de: string;
  ate: string;
  automacaoId: string;
  modeloId: string;
  status: StatusChamada | '';
  pagina: number;
  tamanho: number;
}
