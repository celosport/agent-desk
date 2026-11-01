/** DTOs de /api/v1/notificacoes (mesmos nomes do JSON da API). */
export interface DispositivoAlerta {
  dispositivoId: string;
  nome: string;
  endpoint: string;
  criadoEm: string;
}

export interface PreferenciasAlerta {
  automacoes: boolean;
  sessoes: boolean;
  permissoes: boolean;
}

export interface Notificacoes {
  /** Chave VAPID do servidor: o navegador precisa dela para criar a inscrição de push. */
  chavePublica: string;
  dispositivos: DispositivoAlerta[];
  preferencias: PreferenciasAlerta;
}

/** A inscrição de push que o navegador criou para este aparelho. */
export interface InscricaoPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface RegistrarDispositivoRequest extends InscricaoPush {
  nome: string;
}

export interface EnvioTeste {
  entregues: number;
}
