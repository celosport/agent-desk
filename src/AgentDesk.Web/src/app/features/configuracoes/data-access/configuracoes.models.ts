// Modelos = DTOs do módulo Configuracoes da API (src/Modules/Configuracoes/.../Application/DTOs/ConfiguracaoDtos.cs).
// Mantenha os nomes iguais ao JSON (camelCase; nulos omitidos). A API key NUNCA vem da API: só "configurada" e a máscara.

export interface Configuracao {
  chaveApiConfigurada: boolean;
  /** "sk-ant-...abcd" */
  chaveApiMascarada?: string;
  modeloPadraoId?: string;
  limiteMensalUsd?: number;
  bloquearAoAtingirLimite: boolean;
}

export interface TesteChave {
  valida: boolean;
  testadaEm: string;
}

export interface SalvarPreferenciasRequest {
  modeloPadraoId: string | null;
  limiteMensalUsd: number | null;
  bloquearAoAtingirLimite: boolean;
}

/** Preços em US$ por milhão de tokens. Cache sem preço = cobrado como entrada. */
export interface Modelo {
  modeloId: string;
  nomeExibicao: string;
  precoEntradaMTok: number;
  precoSaidaMTok: number;
  precoCacheLeituraMTok?: number;
  precoCacheEscritaMTok?: number;
  ativo: boolean;
  atualizadoEm: string;
}

export interface CriarModeloRequest {
  modeloId: string;
  nomeExibicao: string;
  precoEntradaMTok: number;
  precoSaidaMTok: number;
  precoCacheLeituraMTok: number | null;
  precoCacheEscritaMTok: number | null;
}

export type AtualizarModeloRequest = Omit<CriarModeloRequest, 'modeloId'> & { ativo: boolean };
