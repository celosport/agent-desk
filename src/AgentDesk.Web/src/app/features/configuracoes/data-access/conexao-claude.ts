import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import { mensagemDeErro } from '../../../core/http/problema';

// Conexão do Claude Code do usuário (módulo Sessoes da API): tokens de ingestão e o comando que instala o coletor no PC.
// [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]

/** = TokenIngestaoDto. O segredo nunca vem na lista. */
export interface TokenIngestao {
  tokenId: string;
  nome: string;
  prefixo: string;
  criadoEm: string;
  ultimoUsoEm?: string;
  revogadoEm?: string;
}

/** = TokenCriadoDto: o único momento em que o segredo aparece. */
export interface TokenCriado {
  token: TokenIngestao;
  segredo: string;
}

export interface ComandosInstalacao {
  windows: string;
  unix: string;
}

/**
 * Comandos que baixam o coletor (servido pelo próprio app em /coletor) e rodam o "instalar" com o token. Aspas e cifrões do nome
 * da máquina saem (o comando vai ser colado num terminal).
 */
export function comandosDeInstalacao(urlApp: string, urlApi: string, token: string, maquina: string): ComandosInstalacao {
  const app = urlApp.replace(/\/+$/, '');
  const api = urlApi.replace(/\/+$/, '');
  const nome = maquina.replace(/["'`$\\]/g, '').trim() || 'Computador';
  const instalar = `instalar --url "${api}" --token "${token}" --maquina "${nome}"`;
  return {
    windows:
      `New-Item -ItemType Directory -Force "$HOME\\.agentdesk" | Out-Null; ` +
      `Invoke-WebRequest "${app}/coletor/agentdesk-coletor.mjs" -OutFile "$HOME\\.agentdesk\\agentdesk-coletor.mjs"; ` +
      `node "$HOME\\.agentdesk\\agentdesk-coletor.mjs" ${instalar}`,
    unix:
      `mkdir -p ~/.agentdesk && curl -fsSL "${app}/coletor/agentdesk-coletor.mjs" -o ~/.agentdesk/agentdesk-coletor.mjs && ` +
      `node ~/.agentdesk/agentdesk-coletor.mjs ${instalar}`,
  };
}

/**
 * Quem já instalou antes baixa o coletor novo e roda "atualizar": reaproveita a conexão salva (sem outro token) e liga a statusline
 * com as barras de 5 h e da semana. [[ADR-013 - Janelas de Uso da Assinatura (Statusline)]]
 */
export function comandosDeAtualizacao(urlApp: string): ComandosInstalacao {
  const app = urlApp.replace(/\/+$/, '');
  return {
    windows:
      `Invoke-WebRequest "${app}/coletor/agentdesk-coletor.mjs" -OutFile "$HOME\\.agentdesk\\agentdesk-coletor.mjs"; ` +
      `node "$HOME\\.agentdesk\\agentdesk-coletor.mjs" atualizar`,
    unix:
      `curl -fsSL "${app}/coletor/agentdesk-coletor.mjs" -o ~/.agentdesk/agentdesk-coletor.mjs && ` +
      `node ~/.agentdesk/agentdesk-coletor.mjs atualizar`,
  };
}

@Injectable({ providedIn: 'root' })
export class ConexaoClaudeApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/sessoes/tokens`;

  listar(): Promise<TokenIngestao[]> {
    return firstValueFrom(this.http.get<TokenIngestao[]>(this.base));
  }

  criar(nome: string): Promise<TokenCriado> {
    return firstValueFrom(this.http.post<TokenCriado>(this.base, { nome }));
  }

  revogar(tokenId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${tokenId}`));
  }
}

/** Estado da seção "Claude Code" de Configurações. O segredo recém-criado fica só na memória da tela. */
@Injectable()
export class ConexaoClaudeStore {
  private readonly api = inject(ConexaoClaudeApi);

  readonly tokens = signal<TokenIngestao[]>([]);
  readonly criado = signal<TokenCriado | null>(null);
  readonly erro = signal<string | null>(null);

  async carregar(): Promise<void> {
    try {
      this.tokens.set(await this.api.listar());
      this.erro.set(null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  async criar(nome: string): Promise<string | null> {
    try {
      const criado = await this.api.criar(nome);
      this.criado.set(criado);
      this.tokens.update((l) => [criado.token, ...l]);
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }

  async revogar(tokenId: string): Promise<string | null> {
    try {
      await this.api.revogar(tokenId);
      if (this.criado()?.token.tokenId === tokenId) this.criado.set(null);
      await this.carregar();
      return null;
    } catch (e) {
      return mensagemDeErro(e);
    }
  }

  esconderSegredo(): void {
    this.criado.set(null);
  }
}
