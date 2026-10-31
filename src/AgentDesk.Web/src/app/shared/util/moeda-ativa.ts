import { signal } from '@angular/core';

// Moeda em que os valores são MOSTRADOS. Os dados (custos, preços, limites) continuam em dólar: aqui só se converte para exibir.
// Signals de propósito: um template que chama formatarDolar() passa a depender deles e se atualiza quando a moeda muda.
// [[ADR-014 - Moedas (Cotação PTAX do Banco Central)]]

export type Moeda = 'USD' | 'BRL' | 'EUR' | 'GBP';

export const MOEDAS: readonly { codigo: Moeda; simbolo: string; nome: string }[] = [
  { codigo: 'USD', simbolo: 'US$', nome: 'Dólar' },
  { codigo: 'BRL', simbolo: 'R$', nome: 'Real' },
  { codigo: 'EUR', simbolo: '€', nome: 'Euro' },
  { codigo: 'GBP', simbolo: '£', nome: 'Libra' },
];

export function ehMoeda(valor: unknown): valor is Moeda {
  return MOEDAS.some((m) => m.codigo === valor);
}

export const moedaAtiva = signal<Moeda>('USD');

/** Quanto vale 1 US$ em cada moeda (a API manda USD, BRL, EUR e GBP). Null = sem cotação: tudo segue em dólar. */
export const taxasPorDolar = signal<Partial<Record<Moeda, number>> | null>(null);

/** A moeda realmente usada: a escolhida, se houver cotação dela; senão o dólar. */
export function moedaEfetiva(): { moeda: Moeda; taxa: number } {
  const moeda = moedaAtiva();
  const taxa = taxasPorDolar()?.[moeda];
  return moeda !== 'USD' && taxa !== undefined && taxa > 0 ? { moeda, taxa } : { moeda: 'USD', taxa: 1 };
}
