import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { Moeda, ehMoeda, moedaAtiva, moedaEfetiva, taxasPorDolar } from '../../shared/util/moeda-ativa';

/** = CotacoesDto da API (GET /api/v1/cotacoes): quanto vale 1 US$ em cada moeda, com a fonte e o dia da PTAX. */
export interface Cotacoes {
  base: 'USD';
  taxas: Partial<Record<Moeda, number>>;
  /** "2026-10-29". */
  dataCotacao: string;
  fonte: string;
  atualizadaEm: string;
}

/** Guardada só neste navegador (conveniência por aparelho, como o tema). */
export const CHAVE_MOEDA = 'agentdesk.moeda';

function lerMoedaSalva(): Moeda {
  try {
    const salva = localStorage.getItem(CHAVE_MOEDA);
    return ehMoeda(salva) ? salva : 'USD';
  } catch {
    return 'USD';
  }
}

/**
 * Moeda de exibição. Os números do app são calculados em dólar (preço da Anthropic); aqui se escolhe em que moeda aparecem e se carrega
 * a cotação (PTAX do Banco Central, guardada pelo servidor). Sem cotação, tudo segue em dólar e o seletor só oferece o dólar.
 * [[ADR-014 - Moedas (Cotação PTAX do Banco Central)]]
 */
@Injectable({ providedIn: 'root' })
export class MoedaApp {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);

  readonly cotacoes = signal<Cotacoes | null>(null);
  readonly escolhida = moedaAtiva;
  /** A moeda em uso de verdade (cai para o dólar se a escolhida não tem cotação). */
  readonly efetiva = computed(() => moedaEfetiva().moeda);
  readonly disponiveis = computed<Moeda[]>(() => {
    const taxas = this.cotacoes()?.taxas;
    return taxas ? (['USD', 'BRL', 'EUR', 'GBP'] as const).filter((m) => m === 'USD' || (taxas[m] ?? 0) > 0) : ['USD'];
  });

  constructor() {
    moedaAtiva.set(lerMoedaSalva());
  }

  /** Busca a cotação (uma vez por sessão do app basta: a PTAX muda no máximo algumas vezes por dia). Falha = segue em dólar. */
  async carregar(): Promise<void> {
    try {
      const cotacoes = await firstValueFrom(this.http.get<Cotacoes>(`${this.api}/api/v1/cotacoes`));
      this.cotacoes.set(cotacoes);
      taxasPorDolar.set(cotacoes.taxas);
    } catch {
      this.cotacoes.set(null);
      taxasPorDolar.set(null);
    }
  }

  escolher(moeda: Moeda): void {
    moedaAtiva.set(moeda);
    try {
      localStorage.setItem(CHAVE_MOEDA, moeda);
    } catch {
      /* sem armazenamento (janela privada): vale só nesta visita */
    }
  }
}
