// = DTOs do módulo Sessoes da API (GET /api/v1/sessoes/ao-vivo). Mesmos nomes do JSON.
import { StatusSessao } from '../motor/sessao';

export interface SessaoAoVivo {
  sessaoId: string;
  maquina: string;
  status: StatusSessao;
  atividade?: string;
  modelo?: string;
  /** Entrada + saída + cache (leitura e escrita). */
  tokens: number;
  tokensCacheLeitura: number;
  /** Quanto custaria na API (a assinatura não cobra por token). */
  custoUsd: number;
  pedidos: number;
  iniciadaEm: string;
  ultimaAtividadeEm: string;
}

/** Uma sala: as sessões de um projeto (pasta). */
export interface ProjetoAoVivo {
  chave: string;
  nome: string;
  sessoes: SessaoAoVivo[];
}

export interface AoVivo {
  projetos: ProjetoAoVivo[];
  atualizadoEm: string;
}
