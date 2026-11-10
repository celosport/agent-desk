// Pose do robô em cada quadro (funções puras, testadas no Vitest): balanço da caminhada, pulinho de quem acorda, digitação,
// comemoração, "não deu" e as vontades do tempo livre. O desenho só obedece; assim dá para testar sem Canvas.
import { Agente } from './agente';
import type { Cara, Quadro } from './sprite';

export type Efeito = 'NENHUM' | 'ACORDAR' | 'DIGITAR' | 'COMEMORAR' | 'ERRO' | 'BEBER' | 'JANELA' | 'ESPREGUICAR';

export interface Pose {
  /** Deslocamento do robô em pixels de arte (x para o lado, y para cima é negativo). */
  dx: number;
  dy: number;
  /** Inclinação do tronco para o lado em que anda (pixels de arte). */
  inclinar: -1 | 0 | 1;
  andando: boolean;
  efeito: Efeito;
  /** Há quanto tempo o efeito começou (ms). */
  t: number;
  bracosParaCima: boolean;
  /** Quadro do sprite (parado, piscando, 4 passos, 2 de digitação), a vista (frente/costas) e para onde os olhos espiam. */
  quadro: Quadro;
  cara: Cara;
  olhar: -1 | 0 | 1;
}

export const POSE_PARADA: Pose = { dx: 0, dy: 0, inclinar: 0, andando: false, efeito: 'NENHUM', t: 0, bracosParaCima: false, quadro: 'parado', cara: 'FRENTE', olhar: 0 };

export const ACORDAR_MS = 450;
export const COMEMORAR_MS = 1500;
export const ERRO_MS = 900;

/** Está andando agora (rumo à mesa, de volta ao canto ou passeando)? */
export function andandoAgora(a: Agente): boolean {
  return a.fase === 'INDO' || a.fase === 'VOLTANDO' || (a.fase === 'OCIOSO' && (a.vida.acao === 'INDO' || a.vida.acao === 'VOLTANDO'));
}

export function poseDe(a: Agente, agora: number, reduzido: boolean): Pose {
  if (reduzido) return a.fase === 'PENSANDO' ? { ...POSE_PARADA, cara: 'COSTAS' } : POSE_PARADA;
  const pisca = agora % 3200 < 140;

  if (andandoAgora(a)) {
    const alvo = a.caminho[0];
    const lado = alvo ? alvo.x - a.posicao.x - (alvo.y - a.posicao.y) : 0; // sinal na tela (isométrico)
    const subindo = alvo ? alvo.x - a.posicao.x + (alvo.y - a.posicao.y) < -0.01 : false; // indo para o fundo da sala: de costas
    const inclinar = lado > 0.01 ? 1 : lado < -0.01 ? -1 : 0;
    let dy = -Math.round(Math.abs(Math.sin(agora / 105)) * 2);
    let efeito: Efeito = 'NENHUM';
    let t = 0;
    if (a.fase === 'INDO' && agora - a.desde < ACORDAR_MS) {
      // Acordou: antena acende e ele dá um pulinho antes de sair
      t = agora - a.desde;
      efeito = 'ACORDAR';
      dy -= Math.round(Math.sin((t / ACORDAR_MS) * Math.PI) * 4);
    }
    return {
      dx: 0, dy, inclinar, andando: true, efeito, t, bracosParaCima: false,
      quadro: `passo${Math.floor(agora / 120) % 4}` as Quadro,
      cara: subindo ? 'COSTAS' : 'FRENTE',
      olhar: inclinar,
    };
  }

  if (a.fase === 'PENSANDO') {
    const batida = Math.floor(agora / 150) % 2;
    return { ...POSE_PARADA, dy: batida === 0 ? 0 : 1, efeito: 'DIGITAR', t: agora - a.desde, quadro: batida === 0 ? 'digita0' : 'digita1', cara: 'COSTAS' };
  }

  if (a.fase === 'RESULTADO') {
    const t = agora - a.desde;
    if (a.balao?.tipo === 'erro') {
      if (t < ERRO_MS) return { ...POSE_PARADA, dx: Math.round(Math.sin(t / 70) * 2), efeito: 'ERRO', t };
    } else if (t < COMEMORAR_MS) {
      return { ...POSE_PARADA, dy: -Math.round(Math.abs(Math.sin((t / 500) * Math.PI)) * 5), efeito: 'COMEMORAR', t, bracosParaCima: true };
    }
  }

  if (a.fase === 'OCIOSO' && a.vida.acao === 'PARADO') {
    const t = agora - a.vida.desde;
    const duracao = Math.max(1, a.vida.parado);
    switch (a.vida.motivo) {
      case 'ESPREGUICAR':
        return {
          ...POSE_PARADA,
          dy: -Math.round(Math.sin(Math.min(1, t / duracao) * Math.PI) * 2),
          efeito: 'ESPREGUICAR',
          t,
          bracosParaCima: t > 350 && t < duracao - 350,
        };
      case 'BEBEDOURO':
        return { ...POSE_PARADA, dy: Math.floor(t / 400) % 2 === 0 ? 0 : 1, efeito: 'BEBER', t, olhar: 1 };
      case 'JANELA':
        return { ...POSE_PARADA, dx: [0, -1, -1, 0, 1, 1][Math.floor(t / 750) % 6], efeito: 'JANELA', t, cara: 'COSTAS' };
      case 'OLHAR_AO_REDOR':
        return { ...POSE_PARADA, dx: [0, -1, 0, 1][Math.floor(t / 700) % 4], olhar: ([0, -1, 0, 1] as const)[Math.floor(t / 700) % 4], quadro: pisca ? 'piscando' : 'parado' };
    }
  }

  // Parado no canto: respira devagar
  return { ...POSE_PARADA, dy: Math.floor(agora / 600) % 2 === 0 ? 1 : 0, quadro: pisca ? 'piscando' : 'parado' };
}

/**
 * Dois robôs andando um para cima do outro se desviam: cada um ganha um pulo para o lado (pixels de arte, na tela).
 * Quem tem o código "menor" vai para a direita, o outro para a esquerda — sempre em lados opostos.
 */
export function desvios(agentes: Agente[]): Map<string, number> {
  const mapa = new Map<string, number>();
  const andando = agentes.filter(andandoAgora);
  for (let i = 0; i < andando.length; i++) {
    for (let j = i + 1; j < andando.length; j++) {
      const a = andando[i];
      const b = andando[j];
      if (Math.hypot(a.posicao.x - b.posicao.x, a.posicao.y - b.posicao.y) > 0.9) continue;
      const aDireita = a.codigo < b.codigo;
      mapa.set(a.codigo, (mapa.get(a.codigo) ?? 0) + (aDireita ? 5 : -5));
      mapa.set(b.codigo, (mapa.get(b.codigo) ?? 0) + (aDireita ? -5 : 5));
    }
  }
  return mapa;
}
