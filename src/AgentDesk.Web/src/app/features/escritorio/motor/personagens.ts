// Personagens ORIGINAIS do Escritório: pequenos robôs-agentes desenhados em pixel art por código (sem imagens externas).
// Cada automação vira um robô; o `codigo` da automação escolhe o visual. Automação nova sem visual próprio usa o padrão.
import { Ponto } from './iso';

/**
 * Sprite 10 × 14 em texto: cada letra é uma cor da paleta do personagem; "." é transparente.
 * a antena · b cabeça · c tela do rosto · d olhos · e pescoço · f corpo · g crachá · h pés
 */
const ROBO_PARADO = [
  '....a.....',
  '....a.....',
  '..bbbbbb..',
  '.bccccccb.',
  '.bcdccdcb.',
  '.bccccccb.',
  '..bbbbbb..',
  '....ee....',
  '.ffffffff.',
  'f.ffgfff.f',
  'f.ffffff.f',
  '..ffffff..',
  '..ff..ff..',
  '..hh..hh..',
];

/** Quadro alternado da caminhada (pernas trocam). */
const ROBO_ANDANDO = [...ROBO_PARADO.slice(0, 12), '..ff...f..', '..hh...hh.'];

/** Olhos "fechados" para piscar. */
const ROBO_PISCANDO = ROBO_PARADO.map((linha, i) => (i === 4 ? '.bccccccb.' : linha));

export const SPRITES = { parado: ROBO_PARADO, andando: ROBO_ANDANDO, piscando: ROBO_PISCANDO } as const;
export const SPRITE_L = 10;
export const SPRITE_A = 14;
/** Cada pixel do sprite vira 2 × 2 pixels de arte: o robô fica com 20 × 28, proporcional ao ladrilho de 32 × 16. */
export const ROBO_ESCALA = 2;

export type Paleta = Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h', string>;

export interface Personagem {
  /** Nome do robô (o da automação aparece junto). */
  apelido: string;
  paleta: Paleta;
}

const base = { c: '#1b2233', e: '#8a93a6', h: '#2b2f3a' };

export const PERSONAGENS: Record<string, Personagem> = {
  'relatorio-executivo': { apelido: 'Rel', paleta: { ...base, a: '#ffd43b', b: '#4c6ef5', d: '#74f0ff', f: '#364fc7', g: '#ffd43b' } },
  'analisar-codigo': { apelido: 'Bit', paleta: { ...base, a: '#69db7c', b: '#2f9e44', d: '#b2f2bb', f: '#2b8a3e', g: '#e9ecef' } },
  'resumir-documento': { apelido: 'Sumi', paleta: { ...base, a: '#ff8787', b: '#f76707', d: '#fff3bf', f: '#d9480f', g: '#ffe066' } },
};

const PADRAO: Personagem = { apelido: 'Agente', paleta: { ...base, a: '#ced4da', b: '#868e96', d: '#e9ecef', f: '#495057', g: '#f1f3f5' } };

export function personagemDe(codigo: string): Personagem {
  return PERSONAGENS[codigo] ?? PADRAO;
}

/** Até 3 mesas na fileira de trás; cada agente tem o seu canto na frente da sala (o "lounge"). */
const MESAS: Ponto[] = [
  { x: 1, y: 2 },
  { x: 3, y: 2 },
  { x: 5, y: 2 },
  { x: 7, y: 2 },
];
const CANTOS: Ponto[] = [
  { x: 5, y: 6 },
  { x: 1, y: 6 },
  { x: 3, y: 7 },
  { x: 7, y: 6 },
];

/** Lugar da i-ésima automação (na ordem da API). Mais de 4 automações reaproveitam os lugares. */
export function lugarDe(indice: number): { mesa: Ponto; canto: Ponto } {
  return { mesa: MESAS[indice % MESAS.length], canto: CANTOS[indice % CANTOS.length] };
}

export const MAXIMO_AGENTES = MESAS.length;
