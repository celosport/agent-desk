// Sprite HD dos robôs (18 × 26 pixels de arte), gerado por código: contorno automático, sombreado (luz vindo de cima à esquerda),
// duas vistas (de frente e de costas), ciclo de caminhada de 4 quadros e dois quadros de digitação. Nada de imagens — [[ADR-009 - Escritório em Canvas 2D com Motor Puro]].
// Cada letra é uma cor: a antena/detalhe · b cabeça (B luz, v sombra) · c tela do rosto · d olhos · e pescoço/mãos · f corpo (F luz, w sombra) · g crachá · h pés · o contorno
// · fixas: p/q verde do broto · y/Y capacete · u halo · r rosa (orelhas, corações) · z/Z visor · k/K hélice · W brilho.
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

/** Olhos e boca por expressão, dentro da tela do rosto (x 5..12, y 7..12). */
function olhos(g: Grade, expressao: Expressao, fechado: boolean, olhar: number): void {
  const dx = olhar;
  if (fechado) {
    ret(g, 6 + dx, 10, 2, 1, 'd');
    ret(g, 10 + dx, 10, 2, 1, 'd');
  } else {
    switch (expressao) {
      case 'CONCENTRADO':
        ret(g, 6 + dx, 8, 3, 1, 'd');
        ret(g, 9 + dx, 8, 3, 1, 'd');
        ret(g, 6 + dx, 9, 2, 2, 'd');
        ret(g, 10 + dx, 9, 2, 2, 'd');
        break;
      case 'SONOLENTO':
        ret(g, 6 + dx, 9, 2, 1, 'v');
        ret(g, 10 + dx, 9, 2, 1, 'v');
        ret(g, 6 + dx, 10, 2, 1, 'd');
        ret(g, 10 + dx, 10, 2, 1, 'd');
        break;
      case 'BRAVO':
        // sobrancelhas inclinadas (o canto de fora mais alto) e boca virada para baixo
        ret(g, 6 + dx, 9, 2, 2, 'd');
        ret(g, 10 + dx, 9, 2, 2, 'd');
        pontos(g, 'd', [[6 + dx, 7], [7 + dx, 8], [11 + dx, 7], [10 + dx, 8], [7, 12], [8, 11], [9, 11], [10, 12]]);
        break;
      case 'ESPANTADO':
        ret(g, 6 + dx, 8, 2, 3, 'd');
        ret(g, 10 + dx, 8, 2, 3, 'd');
        ret(g, 8, 11, 2, 2, 'd');
        break;
      case 'APAIXONADO':
        // olhos de coração (rosa), sem acompanhar o olhar para caber na tela
        pontos(g, 'r', [[6, 8], [8, 8], [6, 9], [7, 9], [8, 9], [7, 10], [10, 8], [12, 8], [10, 9], [11, 9], [12, 9], [11, 10]]);
        pontos(g, 'd', [[8, 12], [9, 12]]);
        break;
      default:
        ret(g, 6 + dx, 8, 2, 2, 'd');
        ret(g, 10 + dx, 8, 2, 2, 'd');
    }
  }
  if (expressao === 'FELIZ') pontos(g, 'd', [[7 + dx, 11], [8 + dx, 12], [9 + dx, 12], [10 + dx, 11]]);
}

/** Antena (linhas 1 a 4). `anim` (0..3) balança, pisca ou gira as que têm movimento. */
function antena(g: Grade, tipo: Antena, anim: number): void {
  const bal = [0, 1, 0, -1][anim];
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
    case 'MOLA':
      // mola que balança de um lado para o outro
      ret(g, 8, 4, 2, 1, 'e');
      ret(g, 8 + bal, 3, 2, 1, 'e');
      ret(g, 8 - bal, 2, 2, 1, 'e');
      ret(g, 7 + bal, 1, 4, 1, 'a');
      break;
    case 'RAIO': {
      // raio que pisca, espelhando de tempos em tempos
      const raio: [number, number][] = [[9, 1], [10, 1], [8, 2], [9, 2], [9, 3], [10, 3], [8, 4], [9, 4]];
      pontos(g, 'a', raio.map(([x, y]) => [anim >= 2 ? 17 - x : x, y] as [number, number]));
      break;
    }
    case 'PARABOLICA':
      // antena parabólica que "gira" (vira de lado) e pisca a ponta
      ret(g, 6 + bal, 2, 6, 1, 'a');
      ret(g, 7 + bal, 3, 4, 1, 'a');
      ret(g, 8, 4, 2, 1, 'e');
      ret(g, 8 + bal, 1, 2, 1, anim % 2 === 0 ? 'a' : 'e');
      break;
    case 'BROTO': {
      // broto de planta: as folhinhas sobem e descem com o vento
      const sobe = anim === 1 || anim === 2 ? 1 : 0;
      ret(g, 8, 3, 2, 2, 'p');
      ret(g, 6, 2 + sobe, 2, 1, 'p');
      ret(g, 10, 2 + sobe, 2, 1, 'p');
      ret(g, 7, 3, 1, 1, 'p');
      ret(g, 10, 3, 1, 1, 'p');
      ret(g, 8, 1, 2, 2, 'q');
      break;
    }
    case 'NENHUMA':
      break;
  }
}

function acessorio(g: Grade, tipo: Acessorio, cara: Cara, anim: number, quadro: Quadro): void {
  const frente = cara === 'FRENTE';
  switch (tipo) {
    case 'NENHUM':
      break;
    case 'BONE':
      ret(g, 3, 5, 12, frente ? 2 : 3, 'a');
      pontos(g, '.', [[3, 5], [14, 5]]);
      if (frente) ret(g, 3, 7, 8, 1, 'a');
      break;
    case 'CHAPEU':
      ret(g, 5, 1, 8, 4, 'a');
      ret(g, 5, 4, 8, 1, 'v');
      ret(g, 2, 5, 14, 1, 'a');
      break;
    case 'FONE': {
      const copo = anim < 2 ? 'a' : 'v'; // as conchas "pulsam" no ritmo da música
      ret(g, 4, 4, 10, 1, 'a');
      ret(g, 3, 5, 1, 3, 'a');
      ret(g, 14, 5, 1, 3, 'a');
      ret(g, 2, 8, 2, 5, copo);
      ret(g, 14, 8, 2, 5, copo);
      break;
    }
    case 'OCULOS':
      if (frente) {
        ret(g, 5, 7, 8, 1, 'a');
        ret(g, 5, 10, 8, 1, 'a');
        ret(g, 5, 7, 1, 4, 'a');
        ret(g, 12, 7, 1, 4, 'a');
        ret(g, 8, 8, 2, 1, 'a');
        pontos(g, 'W', [[6 + anim * 2 - (anim === 3 ? 1 : 0), 7]]); // reflexo que passa pela armação
      } else {
        pontos(g, 'a', [[3, 9], [14, 9], [3, 8], [14, 8]]);
      }
      break;
    case 'GRAVATA':
      if (frente) {
        const bal = quadro === 'passo0' ? 1 : quadro === 'passo2' ? -1 : 0; // balança quando anda
        ret(g, 8, 16, 2, 1, 'a');
        ret(g, 8 + bal, 17, 2, 3, 'a');
        ret(g, 8 + bal, 20, 2, 1, 'a');
      }
      break;
    case 'LACO': {
      const y = anim === 2 ? 1 : 0; // as pontas do laço mexem
      ret(g, 9, 2 + y, 2, 3 - y, 'a');
      ret(g, 13, 2 + y, 2, 3 - y, 'a');
      ret(g, 11, 3, 2, 1, 'e');
      break;
    }
    case 'COROA':
      ret(g, 5, 3, 8, 3, 'a');
      pontos(g, 'a', [[5, 2], [8, 2], [9, 2], [12, 2]]);
      const brilhos: [number, number][] = [[5, 2], [8, 2], [12, 2], [9, 2]];
      pontos(g, 'W', [brilhos[anim]]); // brilho que passa pelas pontas
      break;
    case 'HELICE': {
      // boné com hélice girando (a largura das pás muda a cada quadro)
      ret(g, 3, 5, 12, 2, 'a');
      pontos(g, '.', [[3, 5], [14, 5]]);
      if (frente) ret(g, 3, 7, 8, 1, 'a');
      ret(g, 8, 3, 2, 2, 'e');
      const meia = [5, 3, 1, 3][anim];
      ret(g, 9 - meia, 2, meia, 1, 'k');
      ret(g, 9, 2, meia, 1, 'K');
      break;
    }
    case 'CAPACETE':
      ret(g, 4, 3, 10, 4, 'y');
      ret(g, 3, 5, 12, 2, 'y');
      ret(g, 8, 2, 2, 2, 'Y');
      ret(g, 2, 6, 14, 1, 'Y');
      if (frente) ret(g, 8, 4, 2, 2, anim % 2 === 0 ? 'z' : 'Z'); // lanterna que pisca
      break;
    case 'ORELHAS': {
      // orelhas de gato; a direita dá uma "tremidinha" de vez em quando
      const esq: [number, number][] = [[4, 3], [4, 4], [5, 4], [4, 5], [5, 5], [6, 5]];
      const dir = esq.map(([x, y]) => [17 - x, y] as [number, number]);
      pontos(g, 'b', esq);
      pontos(g, 'b', anim === 3 ? dir.map(([x, y]) => [x + (y === 3 ? 1 : 0), y] as [number, number]) : dir);
      pontos(g, 'r', [[5, 5], [12, 5], [5, 4]]);
      pontos(g, 'r', [[12, 4]]);
      break;
    }
    case 'HALO': {
      // auréola que flutua
      const y = anim === 1 || anim === 2 ? 1 : 2;
      ret(g, 5, y, 8, 1, 'u');
      pontos(g, 'u', [[4, y + 1], [13, y + 1]]);
      ret(g, 5, y + 2, 8, 1, 'u');
      break;
    }
    case 'VISOR':
      if (frente) {
        ret(g, 4, 7, 10, 1, 'z');
        ret(g, 4, 10, 10, 1, 'Z');
        ret(g, 4, 8, 1, 2, 'Z');
        ret(g, 13, 8, 1, 2, 'Z');
        pontos(g, 'W', [[5 + anim * 2, 7]]); // luz de varredura
      } else {
        ret(g, 3, 8, 12, 1, 'Z');
      }
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
 * `olhar` (-1, 0, 1) desloca os olhos para o lado em que o robô anda; `bracosParaCima` é a comemoração; `anim` (0..3) é o
 * quadro da animação de antena e acessório (hélice girando, reflexo nos óculos, mola balançando…).
 */
export function montarSprite(
  p: Pick<Personagem, 'antena' | 'expressao' | 'acessorio'>,
  quadro: Quadro,
  cara: Cara = 'FRENTE',
  olhar: -1 | 0 | 1 = 0,
  bracosParaCima = false,
  anim = 0,
): readonly string[] {
  const an = anim & 3;
  const chave = `${quadro}|${p.antena}|${p.expressao}|${p.acessorio}|${cara}|${cara === 'FRENTE' ? olhar : 0}|${bracosParaCima}|${an}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;

  const g = nova();
  pernas(g, quadro);
  tronco(g, cara);
  bracos(g, quadro, bracosParaCima);
  cabeca(g, cara);
  if (cara === 'FRENTE') olhos(g, p.expressao, quadro === 'piscando', olhar);
  antena(g, p.antena, an);
  acessorio(g, p.acessorio, cara, an, quadro);
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
      // cores fixas dos acessórios e antenas novos (não dependem da paleta do personagem)
      p: '#3ddc84',
      q: '#1f9d55',
      y: '#ffd43b',
      Y: '#e0a100',
      u: '#ffe58a',
      r: '#ff7eb6',
      z: '#22d3ee',
      Z: '#0e7490',
      k: '#ff5d5d',
      K: '#4dabf7',
      W: '#ffffff',
    };
    coresPorPaleta.set(paleta, c);
  }
  return c;
}
