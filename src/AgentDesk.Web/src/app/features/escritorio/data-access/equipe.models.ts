// = DTOs do módulo Equipe da API (/api/v1/equipe). Mesmos nomes do JSON; enums em SNAKE_CASE_UPPER.
import { Acessorio, Antena, Expressao } from '../motor/personagens';

/** AUTOMACAO: chave = código da automação (ordem 0). PROJETO: chave = chave do projeto das sessões; ordem = posição na equipe (0 a 7). */
export type AlvoAgente = 'AUTOMACAO' | 'PROJETO';

export interface AgenteEquipe {
  alvo: AlvoAgente;
  chave: string;
  ordem: number;
  nome: string;
  corCabeca: string;
  corCorpo: string;
  corDetalhe: string;
  corOlhos: string;
  acessorio: Acessorio;
  antena: Antena;
  expressao: Expressao;
  atualizadoEm: string;
}

export type SalvarAgenteEquipe = Omit<AgenteEquipe, 'atualizadoEm'>;
