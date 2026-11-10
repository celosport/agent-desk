// Sprite HD dos robôs (18 × 26 pixels de arte), gerado por código: contorno automático, sombreado (luz vindo de cima à esquerda),
// duas vistas (de frente e de costas), ciclo de caminhada de 4 quadros e dois quadros de digitação. Nada de imagens — [[ADR-009 - Escritório em Canvas 2D com Motor Puro]].
// Cada letra é uma cor: a antena/detalhe · b cabeça (B luz, v sombra) · c tela do rosto · d olhos · e pescoço/mãos · f corpo (F luz, w sombra) · g crachá · h pés · o contorno.
import type { Acessorio, Antena, Expressao, Paleta, Personagem } from './personagens';

export const SPRITE_L = 18;
export const SPRITE_A = 26;
/** 1 pixel de arte por pixel do sprite: o robô tem o mesmo tamanho na sala de antes, com ~4× mais detalhe. */
export const ROBO_ESCALA = 1;

export type Quadro = 'parado' | 'piscando' | 'passo0' | 'passo1' | 'passo2' | 'passo3' | 'digita0' | 'digita1';
export const QUADROS: readonly Quadro[] = ['parado', 'piscando', 'passo0', 'passo1', 'passo2', 'passo3', 'digita0', 'digita1'];
/** De frente (olhando para quem vê a sala) ou de costas (indo para a mesa, olhando o monitor). */
export type Cara = 'FRENTE' | 'COSTAS';

type Grade = string[][];

function nova(): Grade {
  return Array.from({ length: SPRITE_A }, () => Array<string>(SPRITE_L).fill('.'));
}

function ret(g: Grade, x: number, y: number, w: number, h: number, letra: string): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < SPRITE_A && i >= 0 && i < SPRITE_L) g[j][i] = letra;
}

function pontos(g: Grade, letra: string, lista: [number, number][]): void {
  for (const [x, y] of lista) ret(g, x, y, 1, 1, letra);
}

// ---- partes ----

function pernas(g: Grade, quadro: Quadro): void {
  const levantada = quadro === 'passo0' ? 'D' : quadro === 'passo2' ? 'E' : '';
  for (const [lado, perna, pe] of [['E', 6, 5], ['D', 10, 10]] as const) {
    if (levantada === lado) {
      ret(g, pe, 23, 3, 1, 'h');
    } else {
      ret(g, perna, 23, 2, 1, 'w');
      ret(g, pe, 24, 3, 1, 'h');
    }
  }
}

function bracos(g: Grade, quadro: Quadro, paraCima: boolean): void {
  if (paraCima) {
    for (const x of [1, 15]) {
      ret(g, x, 9, 2, 7, 'f');
      ret(g, x, 7, 2, 2, 'e');
    }
    return;
  }
  // balanço: o braço do lado contrário ao da perna levantada vai para a frente
  const [e, d] =
    quadro === 'passo0' ? [-1, 1] : quadro === 'passo2' ? [1, -1] : quadro === 'digita0' ? [-2, 0] : quadro === 'digita1' ? [0, -2] : [0, 0];
  ret(g, 2, 16 + e, 2, 5, 'f');
  ret(g, 2, 21 + e, 2, 1, 'e');
  ret(g, 14, 16 + d, 2, 5, 'f');
  ret(g, 14, 21 + d, 2, 1, 'e');
}

function tronco(g: Grade, cara: Cara): void {
  ret(g, 5, 16, 8, 7, 'f');
  ret(g, 5, 16, 1, 7, 'F');
  ret(g, 6, 16, 3, 1, 'F');
  ret(g, 12, 16, 1, 7, 'w');
  ret(g, 5, 22, 8, 1, 'w');
  if (cara === 'FRENTE') ret(g, 10, 18, 2, 2, 'g');
  else {
    ret(g, 7, 18, 4, 1, 'w');
    ret(g, 7, 20, 4, 1, 'w');
  }
}

function cabeca(g: Grade, cara: Cara): void {
  ret(g, 7, 15, 4, 1, 'e');
  ret(g, 3, 5, 12, 10, 'b');
  // cantos arredondados
  pontos(g, '.', [[3, 5], [14, 5], [3, 14], [14, 14]]);
  ret(g, 4, 5, 6, 1, 'B');
  ret(g, 3, 6, 1, 4, 'B');
  ret(g, 4, 14, 10, 1, 'v');
  ret(g, 14, 6, 1, 8, 'v');
  if (cara === 'COSTAS') {
    ret(g, 6, 8, 6, 1, 'v');
    ret(g, 6, 10, 6, 1, 'v');
    ret(g, 6, 12, 6, 1, 'v');
  } else {
    ret(g, 5, 7, 8, 6, 'c');
  }
}

/** Olhos por expressão: retângulos [x, y, largura, altura] dentro da tela do rosto (x 5..12, y 7..12). */
function olhos(g: Grade, expressao: Expressao, fechado: boolean, olhar: number): void {
  const dx = olhar;
  if (fechado) {
    ret(g, 6 + dx, 10, 2, 1, 'd');
    ret(g, 10 + dx, 10, 2, 1, 'd');
  } else if (expressao === 'CONCENTRADO') {
    ret(g, 6 + dx, 8, 3, 1, 'd');
    ret(g, 9 + dx, 8, 3, 1, 'd');
    ret(g, 6 + dx, 9, 2, 2, 'd');
    ret(g, 10 + dx, 9, 2, 2, 'd');
  } else if (expressao === 'SONOLENTO') {
    ret(g, 6 + dx, 9, 2, 1, 'v');
    ret(g, 10 + dx, 9, 2, 1, 'v');
    ret(g, 6 + dx, 10, 2, 1, 'd');
    ret(g, 10 + dx, 10, 2, 1, 'd');
  } else {
    ret(g, 6 + dx, 8, 2, 2, 'd');
    ret(g, 10 + dx, 8, 2, 2, 'd');
  }
  if (expressao === 'FELIZ') pontos(g, 'd', [[7 + dx, 11], [8 + dx, 12], [9 + dx, 12], [10 + dx, 11]]);
}

function antena(g: Grade, tipo: Antena): void {
  switch (tipo) {
    case 'RETA':
      ret(g, 8, 3, 2, 2, 'e');
      ret(g, 8, 1, 2, 2, 'a');
      break;
    case 'BOLINHA':
      ret(g, 8, 4, 2, 1, 'e');
      ret(g, 7, 1, 4, 3, 'a');
      pontos(g, '.', [[7, 1], [10, 1]]);
      break;
    case 'DUPLA':
      ret(g, 5, 3, 1, 2, 'e');
      ret(g, 12, 3, 1, 2, 'e');
      ret(g, 4, 1, 2, 2, 'a');
      ret(g, 12, 1, 2, 2, 'a');
      break;
    case 'NENHUMA':
      break;
  }
}

function acessorio(g: Grade, tipo: Acessorio, cara: Cara): void {
  switch (tipo) {
    case 'NENHUM':
      break;
    case 'BONE':
      ret(g, 3, 5, 12, cara === 'FRENTE' ? 2 : 3, 'a');
      pontos(g, '.', [[3, 5], [14, 5]]);
      if (cara === 'FRENTE') ret(g, 3, 7, 8, 1, 'a');
      break;
    case 'CHAPEU':
      ret(g, 5, 1, 8, 4, 'a');
      ret(g, 5, 4, 8, 1, 'v');
      ret(g, 2, 5, 14, 1, 'a');
      break;
    case 'FONE':
      ret(g, 4, 4, 10, 1, 'a');
      ret(g, 3, 5, 1, 3, 'a');
      ret(g, 14, 5, 1, 3, 'a');
      ret(g, 2, 8, 2, 5, 'a');
      ret(g, 14, 8, 2, 5, 'a');
      break;
    case 'OCULOS':
      if (cara === 'FRENTE') {
        ret(g, 5, 7, 8, 1, 'a');
        ret(g, 5, 10, 8, 1, 'a');
        ret(g, 5, 7, 1, 4, 'a');
        ret(g, 12, 7, 1, 4, 'a');
        ret(g, 8, 8, 2, 1, 'a');
      } else {
        pontos(g, 'a', [[3, 9], [14, 9], [3, 8], [14, 8]]);
      }
      break;
    case 'GRAVATA':
      if (cara === 'FRENTE') {
        ret(g, 8, 16, 2, 1, 'a');
        ret(g, 8, 17, 2, 3, 'a');
        ret(g, 8, 20, 2, 1, 'a');
      }
      break;
    case 'LACO':
      ret(g, 9, 2, 2, 3, 'a');
      ret(g, 13, 2, 2, 3, 'a');
      ret(g, 11, 3, 2, 1, 'e');
      break;
    case 'COROA':
      ret(g, 5, 3, 8, 3, 'a');
      pontos(g, 'a', [[5, 2], [8, 2], [9, 2], [12, 2]]);
      break;
    default:
      break;
  }
}

/** Contorno escuro em volta de tudo (vizinhança de 4): dá a leitura "de jogo" mesmo em tamanho pequeno. */
function contornar(g: Grade): void {
  const marcas: [number, number][] = [];
  for (let y = 0; y < SPRITE_A; y++) {
    for (let x = 0; x < SPRITE_L; x++) {
      if (g[y][x] !== '.') continue;
      const viz = [g[y - 1]?.[x], g[y + 1]?.[x], g[y][x - 1], g[y][x + 1]];
      if (viz.some((v) => v !== undefined && v !== '.')) marcas.push([x, y]);
    }
  }
  pontos(g, 'o', marcas);
}

const cache = new Map<string, readonly string[]>();

/**
 * Monta o sprite do quadro com a antena, a expressão e o acessório do personagem (resultado em cache).
 * `olhar` (-1, 0, 1) desloca os olhos para o lado em que o robô anda; `bracosParaCima` é a comemoração.
 */
export function montarSprite(
  p: Pick<Personagem, 'antena' | 'expressao' | 'acessorio'>,
  quadro: Quadro,
  cara: Cara = 'FRENTE',
  olhar: -1 | 0 | 1 = 0,
  bracosParaCima = false,
): readonly string[] {
  const chave = `${quadro}|${p.antena}|${p.expressao}|${p.acessorio}|${cara}|${cara === 'FRENTE' ? olhar : 0}|${bracosParaCima}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;

  const g = nova();
  pernas(g, quadro);
  tronco(g, cara);
  bracos(g, quadro, bracosParaCima);
  cabeca(g, cara);
  if (cara === 'FRENTE') olhos(g, p.expressao, quadro === 'piscando', olhar);
  antena(g, p.antena);
  acessorio(g, p.acessorio, cara);
  contornar(g);

  const linhas = g.map((l) => l.join(''));
  cache.set(chave, linhas);
  return linhas;
}

// ---- cores ----

function misturar(hex: string, com: number, k: number): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const m = (c: number) => Math.round(c + (com - c) * k);
  return `rgb(${m(n(1))} ${m(n(3))} ${m(n(5))})`;
}

const CONTORNO = '#0b0f1f';
const coresPorPaleta = new WeakMap<Paleta, Record<string, string>>();

/** Cor de cada letra do sprite para a paleta do personagem (luz e sombra derivadas da cor da cabeça e do corpo). */
export function coresDoSprite(paleta: Paleta): Record<string, string> {
  let c = coresPorPaleta.get(paleta);
  if (!c) {
    c = {
      a: paleta.a,
      b: paleta.b,
      B: misturar(paleta.b, 255, 0.32),
      v: misturar(paleta.b, 0, 0.3),
      c: paleta.c,
      d: paleta.d,
      e: paleta.e,
      f: paleta.f,
      F: misturar(paleta.f, 255, 0.26),
      w: misturar(paleta.f, 0, 0.32),
      g: paleta.g,
      h: paleta.h,
      o: CONTORNO,
    };
    coresPorPaleta.set(paleta, c);
  }
  return c;
}
