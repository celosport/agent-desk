/** DTOs do aviso push do ADMIN (/api/v1/notificacoes/admin/*; mesmos nomes do JSON da API). */
export interface Destinatario {
  usuarioId: string;
  nome: string;
  email: string;
  /** Aparelhos que aceitaram alertas; com 0 o push não tem para onde ir. */
  aparelhos: number;
  /** Administradores não podem ser vistos pelo "Ver como". */
  ehAdmin: boolean;
}

export interface EnviarAvisoRequest {
  /** `null` = todos os usuários. */
  usuarioIds: string[] | null;
  titulo: string;
  mensagem: string;
  url: string;
}

export interface EnvioAviso {
  escolhidos: number;
  alcancados: number;
  semAparelho: number;
  falhas: number;
}
