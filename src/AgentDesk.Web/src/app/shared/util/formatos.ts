// Formatos pt-BR como funções puras (fáceis de testar). A API manda datas em UTC (ISO 8601); a tela mostra no fuso do Brasil.

export const FUSO_PADRAO = 'America/Sao_Paulo';

/** "30/10/2026" */
export function formatarData(iso: string | null | undefined, fuso = FUSO_PADRAO): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

/** "30/10/2026 13:45" */
export function formatarDataHora(iso: string | null | undefined, fuso = FUSO_PADRAO): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "R$ 1.234,50" */
export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

/**
 * "US$ 4,00" — custos e preços da API da Claude são em dólar. Valores pequenos (preço por token, custo de uma chamada barata)
 * ganham casas extras em vez de virar "US$ 0,00": até `casasMaximas` (padrão 4).
 */
export function formatarDolar(valor: number | null | undefined, casasMaximas = 4): string {
  if (valor === null || valor === undefined) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: casasMaximas,
  }).format(valor);
}

/** Painéis e totais: "US$ 12,35" a partir de US$ 1 e "US$ 0,5703" abaixo (o custo de uma chamada usa formatarDolar com 6). */
export function formatarDolarCompacto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return formatarDolar(valor, Math.abs(valor) >= 1 ? 2 : 4);
}

/** "agora", "há 3 min", "há 2 h", "há 3 dias" (sem converter fuso: é uma diferença de tempo). */
export function formatarHaQuanto(iso: string | null | undefined, agora: number = Date.now()): string {
  if (!iso) return '';
  const segundos = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (segundos < 60) return 'agora';
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86_400) return `há ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86_400);
  return `há ${dias} dia${dias === 1 ? '' : 's'}`;
}

/** "1.234.567" */
export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return new Intl.NumberFormat('pt-BR').format(valor);
}
