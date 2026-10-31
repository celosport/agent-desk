import { moedaEfetiva } from './moeda-ativa';

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

/** "13:45:07" (hora no fuso do Brasil). */
export function formatarHora(iso: string | null | undefined, fuso = FUSO_PADRAO): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));
}

/** Duração em linguagem corrida: "0,4 s", "7 s", "1 min 05 s", "2 h 03 min". */
export function formatarDuracao(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '';
  if (ms < 1000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} s`;
  const minutos = Math.floor(total / 60);
  if (minutos < 60) return `${minutos} min ${String(total % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}

/** "13:45:02 → 13:45:09 · 7 s": início, fim e quanto demorou. */
export function formatarIntervalo(inicioIso: string, fimIso: string): string {
  return `${formatarHora(inicioIso)} → ${formatarHora(fimIso)} · ${formatarDuracao(new Date(fimIso).getTime() - new Date(inicioIso).getTime())}`;
}

/** "hoje às 18:30 · em 2 h 10 min" (a janela renova; horário de Brasília). Já passou → "renovando". */
export function formatarRenovacao(iso: string | null | undefined, agora: number = Date.now(), fuso = FUSO_PADRAO): string {
  if (!iso) return '';
  const alvo = new Date(iso).getTime();
  if (alvo <= agora) return 'renovando';
  const dia = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false }).format(alvo);
  const hoje = dia(agora);
  const amanha = dia(agora + 86_400_000);
  const quando = dia(alvo) === hoje ? 'hoje' : dia(alvo) === amanha ? 'amanhã' : formatarData(iso, fuso).slice(0, 5);
  return `${quando} às ${hora} · em ${formatarDuracao(alvo - agora)}`;
}

/** "R$ 1.234,50" */
export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

/**
 * "US$ 4,00" — custos e preços da API da Claude são em dólar. Valores pequenos (preço por token, custo de uma chamada barata)
 * ganham casas extras em vez de virar "US$ 0,00": até `casasMaximas` (padrão 4). Sempre em dólar: use onde o valor é DEFINIDO em
 * dólar (tabela de preços dos modelos, limite mensal).
 */
export function formatarDolarFixo(valor: number | null | undefined, casasMaximas = 4): string {
  if (valor === null || valor === undefined) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: casasMaximas,
  }).format(valor);
}

/**
 * O custo (calculado em dólar) na moeda que o usuário escolheu — "R$ 21,60", "€ 3,60", "£ 3,00" — pela cotação PTAX do Banco Central;
 * sem cotação ou com o dólar escolhido, "US$ 4,00". Mesmas casas extras para valores pequenos.
 */
export function formatarDolar(valor: number | null | undefined, casasMaximas = 4): string {
  if (valor === null || valor === undefined) return '';
  const { moeda, taxa } = moedaEfetiva();
  if (moeda === 'USD') return formatarDolarFixo(valor, casasMaximas);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: moeda,
    minimumFractionDigits: 2,
    maximumFractionDigits: casasMaximas,
  }).format(valor * taxa);
}

/** Painéis e totais: "US$ 12,35" a partir de US$ 1 e "US$ 0,5703" abaixo (o custo de uma chamada usa formatarDolar com 6). */
export function formatarDolarCompacto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return formatarDolar(valor, Math.abs(valor * moedaEfetiva().taxa) >= 1 ? 2 : 4);
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

/** Fração de 0 a 1 como percentual inteiro: 0,723 → "72%". */
export function formatarPercentual(fracao: number | null | undefined): string {
  if (fracao === null || fracao === undefined) return '';
  return `${Math.round(fracao * 100)}%`;
}

/** "1.234.567" */
export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return new Intl.NumberFormat('pt-BR').format(valor);
}
