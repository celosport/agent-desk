// Geometria isométrica do Escritório (funções puras). Unidade: "pixel de arte" — o desenho multiplica por uma escala inteira
// para a pixel art ficar nítida.

/** Posição no chão da sala, em ladrilhos (pode ser fracionária enquanto o agente anda). */
export interface Ponto {
  x: number;
  y: number;
}

export const LADRILHO_L = 32; // largura do losango
export const LADRILHO_A = 16; // altura do losango
export const SALA = 8; // o escritório: 8 × 8 ladrilhos
/** O andar inteiro (escritório, cozinha, banheiro e descanso): 16 ladrilhos em x e 12 em y — [[mapa.ts]]. */
export const LARGURA = 16;
export const ALTURA = 12;
export const PAREDE = 56; // altura das paredes do fundo

/** Tamanho da cena em pixels de arte (sala + paredes + folga para as cabeças na fileira de trás). */
export const CENA_L = ((LARGURA + ALTURA) * LADRILHO_L) / 2 + 16;
export const CENA_A = ((LARGURA + ALTURA) * LADRILHO_A) / 2 + PAREDE + 36;

const ORIGEM_X = 8 + (ALTURA * LADRILHO_L) / 2; // o canto de trás (0, 0) fica deslocado para a direita: o andar é mais largo que alto
const ORIGEM_Y = PAREDE + 24;

/** Canto de cima do ladrilho (x, y) na tela. */
export function paraTela(p: Ponto): Ponto {
  return {
    x: ORIGEM_X + (p.x - p.y) * (LADRILHO_L / 2),
    y: ORIGEM_Y + (p.x + p.y) * (LADRILHO_A / 2),
  };
}

/** Centro do ladrilho na tela (onde ficam os pés de quem está nele). */
export function centroNaTela(p: Ponto): Ponto {
  const topo = paraTela(p);
  return { x: topo.x, y: topo.y + LADRILHO_A / 2 };
}

/** Ordem de desenho: quem está mais "na frente" (x + y maior) é desenhado depois. */
export function profundidade(p: Ponto): number {
  return p.x + p.y;
}

/**
 * Rota em "L" de ladrilho em ladrilho (primeiro no eixo x, depois no y), sem o ponto de partida.
 * A sala não tem obstáculos no corredor (as mesas ficam numa fileira só), então não precisa de busca de caminho.
 */
export function rota(de: Ponto, ate: Ponto): Ponto[] {
  const passos: Ponto[] = [];
  let x = Math.round(de.x);
  let y = Math.round(de.y);
  while (x !== ate.x) {
    x += Math.sign(ate.x - x);
    passos.push({ x, y });
  }
  while (y !== ate.y) {
    y += Math.sign(ate.y - y);
    passos.push({ x, y });
  }
  return passos;
}

/** Anda `distancia` ladrilhos sobre a rota; devolve a nova posição e a rota que falta. */
export function andar(posicao: Ponto, caminho: Ponto[], distancia: number): { posicao: Ponto; caminho: Ponto[] } {
  let atual = { ...posicao };
  const resto = [...caminho];
  let sobra = distancia;
  while (resto.length && sobra > 0) {
    const alvo = resto[0];
    const dx = alvo.x - atual.x;
    const dy = alvo.y - atual.y;
    const falta = Math.hypot(dx, dy);
    if (falta <= sobra) {
      atual = { ...alvo };
      resto.shift();
      sobra -= falta;
    } else {
      atual = { x: atual.x + (dx / falta) * sobra, y: atual.y + (dy / falta) * sobra };
      sobra = 0;
    }
  }
  return { posicao: atual, caminho: resto };
}

/** Maior escala inteira que cabe na largura (mínimo 1). */
export function escalaPara(larguraDisponivel: number, larguraDaCena = CENA_L): number {
  return Math.max(1, Math.floor(larguraDisponivel / larguraDaCena));
}
