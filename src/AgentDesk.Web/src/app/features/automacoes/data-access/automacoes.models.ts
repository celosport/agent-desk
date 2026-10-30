// Modelos = DTOs do módulo Automacoes da API (src/Modules/Automacoes/.../Application/DTOs/AutomacaoDtos.cs).
// Mantenha os nomes iguais ao JSON (camelCase; nulos omitidos).

export interface Automacao {
  automacaoId: string;
  /** Estável: relatorio-executivo, analisar-codigo, resumir-documento (o Escritório usa para achar o personagem). */
  codigo: string;
  nome: string;
  descricao: string;
  promptSistema: string;
  /** Tem {{entrada}} onde entra o texto do usuário. */
  modeloMensagem: string;
  /** Sem modelo = usa o modelo padrão de cada usuário. */
  modeloId?: string;
  maxTokens: number;
  ativa: boolean;
}

export interface AtualizarAutomacaoRequest {
  nome: string;
  descricao: string;
  promptSistema: string;
  modeloMensagem: string;
  modeloId: string | null;
  maxTokens: number;
  ativa: boolean;
}

export interface ExecutarAutomacaoRequest {
  entrada: string;
  modeloId: string | null;
  nomeArquivo: string | null;
}

export interface Tokens {
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
  total: number;
}

export interface AlertaLimite {
  gastoMesUsd: number;
  limiteMensalUsd: number;
  percentual: number;
  atingido: boolean;
}

export interface Execucao {
  chamadaId: string;
  automacaoId: string;
  codigo: string;
  modeloId: string;
  /** Com fallback, pode ser outro modelo. */
  modeloUsado: string;
  resultado: string;
  /** Cortada no máximo de tokens. */
  truncado: boolean;
  tokens: Tokens;
  custoUsd: number;
  duracaoMs: number;
  iniciadaEm: string;
  alertaLimite?: AlertaLimite;
}

/** Só o que a tela de automações usa de GET /api/v1/modelos (módulo Configuracoes). */
export interface ModeloOpcao {
  modeloId: string;
  nomeExibicao: string;
  precoEntradaMTok: number;
  precoSaidaMTok: number;
  ativo: boolean;
}
