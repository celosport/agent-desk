// Funções puras do painel e do histórico (testadas no Vitest): escala do gráfico, rótulos e parâmetros da consulta.
import { FiltroHistorico } from './consumo.models';

/**
 * Teto "redondo" do eixo e as marcas da grade: 0,0137 → 0,02 com marcas em 0 / 0,01 / 0,02.
 * Sempre começa em zero (barra = magnitude) e nunca devolve teto 0 (o gráfico vazio ainda tem eixo).
 */
export function eixoRedondo(maximo: number, marcas = 4): { teto: number; passos: number[] } {
  if (!(maximo > 0)) return { teto: 1, passos: [0, 0.5, 1] };
  const bruto = maximo / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = ([1, 2, 2.5, 5, 10].find((m) => m * potencia >= bruto) ?? 10) * potencia;
  const teto = passo * Math.ceil(maximo / passo - 1e-9);
  const passos: number[] = [];
  for (let v = 0; v <= teto + passo / 2; v += passo) passos.push(arredondar(v));
  return { teto: arredondar(teto), passos };
}

/** Altura da barra em px; valor > 0 sempre aparece (mínimo de 2px) para não sumir ao lado de um dia caro. */
export function alturaBarra(valor: number, teto: number, alturaUtil: number): number {
  if (!(valor > 0) || !(teto > 0)) return 0;
  return Math.max(2, (valor / teto) * alturaUtil);
}

/** "2026-10-30" → "30/10" (o dia já é o de Brasília: não converte fuso). */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.split('-');
  return `${d}/${mes}`;
}

/** Parâmetros da consulta do histórico: só os filtros preenchidos. */
export function parametrosHistorico(f: FiltroHistorico): Record<string, string | number> {
  const p: Record<string, string | number> = { escopo: f.escopo, pagina: f.pagina, tamanho: f.tamanho };
  if (f.de) p['de'] = f.de;
  if (f.ate) p['ate'] = f.ate;
  if (f.automacaoId) p['automacaoId'] = f.automacaoId;
  if (f.modeloId) p['modeloId'] = f.modeloId;
  if (f.status) p['status'] = f.status;
  return p;
}

/** Porcentagem do limite → estado da barra: normal, alerta (≥ 80%) ou estourado (≥ 100%). */
export function estadoLimite(percentual: number | undefined): 'normal' | 'alerta' | 'estourado' {
  if (percentual === undefined) return 'normal';
  if (percentual >= 100) return 'estourado';
  return percentual >= 80 ? 'alerta' : 'normal';
}

function arredondar(v: number): number {
  return Number(v.toPrecision(12));
}
