// Só os campos que o painel do Início usa, com os mesmos nomes do JSON das APIs de Consumo, Sessoes e Configuracoes.
// (Feature não importa feature: o Início mantém o seu recorte dos DTOs.)

export type EscopoInicio = 'MEU' | 'TODOS';

export interface TotaisApi {
  chamadas: number;
  tokens: number;
  custoUsd: number;
}

export interface ResumoApi {
  hoje: TotaisApi;
  mes: TotaisApi;
  acumulado: TotaisApi;
  dias: number;
  porDia: { dia: string; custoUsd: number }[];
  ranking: { automacaoId?: string; nome: string; custoUsd: number; chamadas: number }[];
  limiteMensalUsd?: number;
  percentualLimite?: number;
}

export interface UsoCodeApi {
  pedidos: number;
  custoUsd: number;
}

export interface PainelCodeApi {
  hoje: UsoCodeApi;
  mes: UsoCodeApi;
  acumulado: UsoCodeApi;
  serie: { dia: string; uso: UsoCodeApi }[];
  projetos: { nome: string; uso: UsoCodeApi }[];
}

export interface JanelaApi {
  percentual: number;
  renovaEm: string;
}

export interface LimitesApi {
  cincoHoras?: JanelaApi;
  semana?: JanelaApi;
}

export interface DicaApi {
  regra: string;
  titulo: string;
  texto: string;
  economiaUsd: number;
}

export interface DicasApi {
  dicas: DicaApi[];
  economiaTotalUsd: number;
}

export interface AoVivoApi {
  projetos: { chave: string; nome: string; sessoes: { sessaoId: string; status: string }[] }[];
}

export interface ConfiguracaoApi {
  chaveApiConfigurada: boolean;
  limiteMensalUsd?: number;
}
