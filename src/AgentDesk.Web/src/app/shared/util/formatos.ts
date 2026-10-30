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
