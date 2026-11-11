// "Vida" dos robôs quando estão sem tarefa: passeiam pelo andar (janela, cozinha, banheiro, sofá da sala de descanso), se espreguiçam.
// Funções puras e determinísticas
// (o sorteio vem do código do robô + um contador, nunca de Math.random), para os testes e para cada robô ter o seu jeito.
import { Ponto } from './iso';
import { LUGARES, MOVEIS, caminhoAte } from './mapa';
import { hashDe } from './personagens';

export { caminhoAte };

export type Motivo = 'JANELA' | 'AGUA' | 'CAFE' | 'PIA' | 'BANHEIRO' | 'SOFA' | 'ESPREGUICAR' | 'OLHAR_AO_REDOR';
/** NENHUMA: esperando a próxima vontade · INDO: andando até o lugar · PARADO: fazendo a coisa · VOLTANDO: indo para o seu canto. */
export type AcaoOciosa = 'NENHUMA' | 'INDO' | 'PARADO' | 'VOLTANDO';

export interface Vida {
  acao: AcaoOciosa;
  motivo: Motivo;
  /** Quando começou a ação atual (ms). */
  desde: number;
  /** NENHUMA: quando bate a próxima vontade (0 = ainda não agendada) · PARADO: quando termina. */
  ate: number;
  /** Quanto tempo fica parado no lugar (ms), definido ao sortear. */
  parado: number;
  /** Quantas vontades já teve: muda o sorteio da próxima. */
  contador: number;
}

export const VIDA_INICIAL: Vida = { acao: 'NENHUMA', motivo: 'OLHAR_AO_REDOR', desde: 0, ate: 0, parado: 0, contador: 0 };

/** Passeio é mais calmo que a ida para a mesa (ladrilhos por segundo). */
export const VELOCIDADE_PASSEIO = 1.6;
export const LUGAR_JANELA: Ponto = LUGARES.janela;

// ---- elevador e cozinha ----
/** Onde o robô fica diante da porta do elevador (parede da esquerda, na frente da sala): bate o crachá, entra e sai por aqui. */
export const ELEVADOR_PE: Ponto = { x: 0, y: 7 };
/** Onde o robô toma o café e a água (na cozinha) enquanto espera uma aprovação, e os lugares do sofá da sala de descanso. */
export const LUGAR_CAFE: Ponto = LUGARES.cafe;
export const LUGAR_AGUA: Ponto = LUGARES.agua;
export const LUGARES_SOFA: readonly Ponto[] = LUGARES.sofa;

/** Número entre 0 e 1, sempre o mesmo para o mesmo robô e o mesmo contador. */
export function sorteio(codigo: string, contador: number, sal = ''): number {
  return (hashDe(`${codigo}:${contador}:${sal}`) % 10000) / 10000;
}

/** Quanto o robô espera (6 a 14 s) antes da próxima vontade. */
export function esperaOciosa(codigo: string, contador: number): number {
  return 6000 + sorteio(codigo, contador, 'espera') * 8000;
}

export interface Passeio {
  motivo: Motivo;
  /** Para onde vai (null = fica onde está). */
  destino: Ponto | null;
  parado: number;
}

/** Lugar do sofá para uma vontade (um dos 3 lugares, conforme o sorteio). */
export function lugarNoSofa(codigo: string, contador: number): Ponto {
  return { ...LUGARES_SOFA[Math.floor(sorteio(codigo, contador, 'sofa') * LUGARES_SOFA.length)] };
}

/**
 * Escolhe o que fazer: janela 12 %, café 15 %, água 10 %, banheiro (cabine) 8 %, lavar as mãos 7 %, sofá vendo TV 23 %,
 * espreguiçar no tapete 13 %, olhar ao redor 12 %.
 */
export function escolherPasseio(codigo: string, contador: number): Passeio {
  const r = sorteio(codigo, contador, 'escolha');
  if (r < 0.12) return { motivo: 'JANELA', destino: LUGAR_JANELA, parado: 4500 };
  if (r < 0.27) return { motivo: 'CAFE', destino: LUGAR_CAFE, parado: 4000 };
  if (r < 0.37) return { motivo: 'AGUA', destino: LUGAR_AGUA, parado: 3500 };
  if (r < 0.45) return { motivo: 'BANHEIRO', destino: { ...MOVEIS.cabine }, parado: 4500 };
  if (r < 0.52) return { motivo: 'PIA', destino: { ...LUGARES.pia }, parado: 3500 };
  if (r < 0.75) return { motivo: 'SOFA', destino: lugarNoSofa(codigo, contador), parado: 8000 };
  if (r < 0.88) {
    const x = 1 + Math.floor(sorteio(codigo, contador, 'x') * 6);
    const y = 5 + Math.floor(sorteio(codigo, contador, 'y') * 3);
    return { motivo: 'ESPREGUICAR', destino: { x, y }, parado: 2600 };
  }
  return { motivo: 'OLHAR_AO_REDOR', destino: null, parado: 3200 };
}

/** Comprimento do que falta andar. */
export function restante(posicao: Ponto, caminho: Ponto[]): number {
  let total = 0;
  let atual = posicao;
  for (const p of caminho) {
    total += Math.hypot(p.x - atual.x, p.y - atual.y);
    atual = p;
  }
  return total;
}

/**
 * Aceleração e freada: começa devagar e termina devagar (nunca zera, para sempre chegar). `decorrido` é o tempo desde que
 * saiu do lugar (ms) e `falta` o que resta da rota (ladrilhos). Resultado entre 0,4 e 1.
 */
export function fatorDeVelocidade(decorrido: number, falta: number): number {
  const saindo = Math.min(1, 0.4 + decorrido / 350);
  const chegando = Math.min(1, 0.4 + falta / 0.7);
  return Math.min(saindo, chegando);
}
