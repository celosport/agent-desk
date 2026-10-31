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

// Mesmos valores (SNAKE_CASE_UPPER) que a API de Equipe grava e valida. [[ADR-011 - Equipe Personalizada (Nome e Aparência dos Agentes)]]
export const ACESSORIOS = ['NENHUM', 'BONE', 'CHAPEU', 'FONE', 'OCULOS', 'GRAVATA', 'LACO', 'COROA'] as const;
export const ANTENAS = ['RETA', 'BOLINHA', 'DUPLA', 'NENHUMA'] as const;
export const EXPRESSOES = ['NORMAL', 'FELIZ', 'CONCENTRADO', 'SONOLENTO'] as const;
export type Acessorio = (typeof ACESSORIOS)[number];
export type Antena = (typeof ANTENAS)[number];
export type Expressao = (typeof EXPRESSOES)[number];

export interface Personagem {
  /** Nome do robô (o da automação aparece junto). */
  apelido: string;
  paleta: Paleta;
  acessorio: Acessorio;
  antena: Antena;
  expressao: Expressao;
}

/** Aparência padrão: sem acessório, antena reta, expressão normal. */
const PADRAO = { acessorio: 'NENHUM', antena: 'RETA', expressao: 'NORMAL' } as const;

const base = { c: '#1b2233', e: '#8a93a6', h: '#2b2f3a' };

export const PERSONAGENS: Record<string, Personagem> = {
  'relatorio-executivo': { ...PADRAO, apelido: 'Rel', paleta: { ...base, a: '#ffd43b', b: '#4c6ef5', d: '#74f0ff', f: '#364fc7', g: '#ffd43b' } },
  'analisar-codigo': { ...PADRAO, apelido: 'Bit', paleta: { ...base, a: '#69db7c', b: '#2f9e44', d: '#b2f2bb', f: '#2b8a3e', g: '#e9ecef' } },
  'resumir-documento': { ...PADRAO, apelido: 'Sumi', paleta: { ...base, a: '#ff8787', b: '#f76707', d: '#fff3bf', f: '#d9480f', g: '#ffe066' } },
};

/** Cores dos robôs sem visual próprio (sessões do Claude Code, automações novas): escolhidas pelo hash do código. */
const CORES: [string, string, string, string][] = [
  // cabeça, corpo, antena/crachá, olhos
  ['#7950f2', '#5f3dc4', '#ffd43b', '#e5dbff'],
  ['#1c7ed6', '#1864ab', '#ff922b', '#d0ebff'],
  ['#e64980', '#a61e4d', '#ffe066', '#ffdeeb'],
  ['#0ca678', '#087f5b', '#ffd8a8', '#c3fae8'],
  ['#f59f00', '#e67700', '#748ffc', '#fff3bf'],
  ['#15aabf', '#0b7285', '#ff8787', '#c5f6fa'],
  ['#868e96', '#495057', '#ced4da', '#f1f3f5'],
  ['#d6336c', '#862e9c', '#63e6be', '#fcc2d7'],
];

/** Apelidos para as sessões do Claude Code (estáveis: o mesmo id sempre dá o mesmo robô). */
const APELIDOS = ['Ada', 'Bolt', 'Cubo', 'Dido', 'Eco', 'Faísca', 'Giro', 'Hertz', 'Íris', 'Jato', 'Kiwi', 'Luma', 'Mola', 'Nina', 'Ohm', 'Pixel'];

export function hashDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function paletaDe(semente: string): Paleta {
  const [b, f, ag, d] = CORES[hashDe(semente) % CORES.length];
  return { ...base, a: ag, b, d, f, g: ag };
}

export function apelidoDeSessao(sessaoId: string): string {
  return APELIDOS[hashDe(`apelido:${sessaoId}`) % APELIDOS.length];
}

export function personagemDe(codigo: string): Personagem {
  return PERSONAGENS[codigo] ?? { ...PADRAO, apelido: 'Agente', paleta: paletaDe(codigo) };
}

/** Visual automático de uma sessão do Claude Code (nome e cor estáveis pelo id), quando o projeto não tem equipe. */
export function personagemDeSessao(sessaoId: string): Personagem {
  return { ...PADRAO, apelido: apelidoDeSessao(sessaoId), paleta: paletaDe(sessaoId) };
}

/** Paletas prontas do editor: cabeça, corpo, detalhe (antena, crachá e acessório) e olhos. */
export const PALETAS_PRONTAS: readonly { nome: string; cabeca: string; corpo: string; detalhe: string; olhos: string }[] = CORES.map(
  ([cabeca, corpo, detalhe, olhos], i) => ({ nome: `Paleta ${i + 1}`, cabeca, corpo, detalhe, olhos }),
);

/** Paleta do robô a partir das 4 cores que o usuário escolhe (o resto — tela, pescoço, pés — é fixo). */
export function paletaDeCores(cabeca: string, corpo: string, detalhe: string, olhos: string): Paleta {
  return { ...base, a: detalhe, b: cabeca, d: olhos, f: corpo, g: detalhe };
}

// ---- camadas: corpo (fixo) + antena + expressão + acessório, tudo em texto, montado por código ----

type Quadro = keyof typeof SPRITES;

/** Antena: linhas 0 e 1. */
const ANTENA_LINHAS: Record<Antena, [string, string]> = {
  RETA: ['....a.....', '....a.....'],
  BOLINHA: ['....aa....', '....a.....'],
  DUPLA: ['.a......a.', '..a....a..'],
  NENHUMA: ['..........', '..........'],
};

/** Tela do rosto: linhas 3 a 5. */
const EXPRESSAO_LINHAS: Record<Expressao, [string, string, string]> = {
  NORMAL: ['.bccccccb.', '.bcdccdcb.', '.bccccccb.'],
  FELIZ: ['.bccccccb.', '.bcdccdcb.', '.bccddccb.'],
  CONCENTRADO: ['.bccccccb.', '.bddccddb.', '.bccccccb.'],
  SONOLENTO: ['.bccccccb.', '.bccccccb.', '.bcdccdcb.'],
};

/** Acessórios: linha → texto sobreposto (só as letras ≠ "." substituem). Usam a cor de detalhe ("a"). */
const ACESSORIO_LINHAS: Record<Acessorio, Record<number, string>> = {
  NENHUM: {},
  BONE: { 2: '..aaaaaa..', 3: '.aa.......' },
  CHAPEU: { 1: '...aaaa...', 2: '.aaaaaaaa.' },
  FONE: { 2: '.a......a.', 3: 'a........a', 4: 'a........a', 5: 'a........a' },
  OCULOS: { 3: '..aaaaaa..', 5: '..aaaaaa..' },
  GRAVATA: { 8: '....aa....', 9: '....aa....' },
  LACO: { 1: '.aa.......', 2: '.aaa......' },
  COROA: { 1: '..a.aa.a..', 2: '..aaaaaa..' },
};

const cache = new Map<string, readonly string[]>();

/** Monta o sprite do quadro com a antena, a expressão e o acessório do personagem (resultado em cache). */
export function montarSprite(p: Pick<Personagem, 'antena' | 'expressao' | 'acessorio'>, quadro: Quadro): readonly string[] {
  const chave = `${quadro}|${p.antena}|${p.expressao}|${p.acessorio}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;

  const linhas = [...SPRITES[quadro]];
  linhas.splice(0, 2, ...ANTENA_LINHAS[p.antena]);
  // Piscar fecha os olhos de qualquer expressão (olho "d" vira tela "c")
  EXPRESSAO_LINHAS[p.expressao].forEach((l, i) => (linhas[3 + i] = quadro === 'piscando' ? l.replaceAll('d', 'c') : l));
  for (const [linha, texto] of Object.entries(ACESSORIO_LINHAS[p.acessorio])) {
    const n = Number(linha);
    linhas[n] = [...linhas[n]].map((c, i) => (texto[i] !== '.' ? texto[i] : c)).join('');
  }
  cache.set(chave, linhas);
  return linhas;
}

/**
 * Até 8 mesas em duas fileiras: a de trás nos x ímpares e a do meio nos x pares, para cada agente ter um corredor livre
 * até a sua mesa (a rota sobe pela coluna dele). Cada agente tem o seu canto na frente da sala (o "lounge").
 */
const MESAS: Ponto[] = [
  { x: 1, y: 2 },
  { x: 3, y: 2 },
  { x: 5, y: 2 },
  { x: 7, y: 2 },
  { x: 0, y: 4 },
  { x: 2, y: 4 },
  { x: 4, y: 4 },
  { x: 6, y: 4 },
];
const CANTOS: Ponto[] = [
  { x: 5, y: 6 },
  { x: 1, y: 6 },
  { x: 3, y: 7 },
  { x: 7, y: 6 },
  { x: 6, y: 7 },
  { x: 0, y: 6 },
  { x: 2, y: 6 },
  { x: 4, y: 6 },
];

/** Lugar da i-ésima posição da sala. Mais de 8 reaproveitam os lugares (a página mostra só 8 por sala). */
export function lugarDe(indice: number): { mesa: Ponto; canto: Ponto } {
  return { mesa: MESAS[indice % MESAS.length], canto: CANTOS[indice % CANTOS.length] };
}

export const MAXIMO_AGENTES = MESAS.length;
