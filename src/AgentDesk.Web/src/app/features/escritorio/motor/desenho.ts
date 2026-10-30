// Desenho da sala no Canvas 2D, em pixels de arte (o contexto já vem escalado). Tudo é desenhado por código: nada de imagens.
import { Agente } from './agente';
import { CENA_A, CENA_L, LADRILHO_A, LADRILHO_L, PAREDE, Ponto, SALA, centroNaTela, paraTela, profundidade } from './iso';
import { ROBO_ESCALA, SPRITES, SPRITE_A, SPRITE_L, personagemDe } from './personagens';

const ROBO_L = SPRITE_L * ROBO_ESCALA;
const ROBO_A = SPRITE_A * ROBO_ESCALA;

export interface PaletaSala {
  fundo: string;
  piso: [string, string];
  tapete: string;
  paredeEsquerda: string;
  paredeDireita: string;
  rodape: string;
  mesaTopo: string;
  mesaLado: [string, string];
  monitor: string;
  telaApagada: string;
  telaAcesa: string;
  vaso: string;
  folha: string;
  janela: string;
  sombra: string;
  destaque: string;
}

export const PALETAS: Record<'claro' | 'escuro', PaletaSala> = {
  claro: {
    fundo: '#f6f7f9',
    piso: ['#ead9bd', '#e3d0b0'],
    tapete: '#c5d0ec',
    paredeEsquerda: '#d4dcea',
    paredeDireita: '#e3e9f3',
    rodape: '#9aa5bb',
    mesaTopo: '#b08457',
    mesaLado: ['#8c6239', '#a0714a'],
    monitor: '#3a4256',
    telaApagada: '#1f2533',
    telaAcesa: '#74f0ff',
    vaso: '#c0583a',
    folha: '#3f9b4f',
    janela: '#a5d8ff',
    sombra: 'rgb(20 22 27 / 0.18)',
    destaque: '#3b5bdb',
  },
  escuro: {
    fundo: '#14161b',
    piso: ['#3b342c', '#352f28'],
    tapete: '#2c3554',
    paredeEsquerda: '#252b38',
    paredeDireita: '#2d3444',
    rodape: '#4a5368',
    mesaTopo: '#7d5a3a',
    mesaLado: ['#5c4129', '#6b4c31'],
    monitor: '#11151f',
    telaApagada: '#0b0e15',
    telaAcesa: '#66d9e8',
    vaso: '#a04a31',
    folha: '#2f7d3c',
    janela: '#1c3d5a',
    sombra: 'rgb(0 0 0 / 0.35)',
    destaque: '#6f88e6',
  },
};

/** Tempo da animação (ms) e se o movimento é reduzido (sem piscar, sem "respirar", tela sem piscar). */
export interface Relogio {
  agora: number;
  reduzido: boolean;
}

export function desenharSala(ctx: CanvasRenderingContext2D, agentes: Agente[], p: PaletaSala, r: Relogio, selecionado: string | null): void {
  ctx.fillStyle = p.fundo;
  ctx.fillRect(0, 0, CENA_L, CENA_A);
  paredes(ctx, p);
  piso(ctx, p);

  // Objetos e agentes juntos, do fundo para a frente
  const pensando = new Set(agentes.filter((a) => a.fase === 'PENSANDO').map((a) => a.codigo));
  const itens: { z: number; desenhar: () => void }[] = [];
  for (const a of agentes) {
    const mesa = { x: a.mesa.x, y: a.mesa.y - 1 };
    itens.push({ z: profundidade(mesa), desenhar: () => mesaComMonitor(ctx, mesa, p, pensando.has(a.codigo), r) });
    itens.push({ z: profundidade(a.posicao) + 0.5, desenhar: () => agente(ctx, a, p, r, a.codigo === selecionado) });
  }
  itens.push({ z: profundidade({ x: 7, y: 7 }), desenhar: () => planta(ctx, { x: 7, y: 7 }, p) });
  itens.push({ z: profundidade({ x: 0, y: 4 }), desenhar: () => planta(ctx, { x: 0, y: 4 }, p) });
  itens.sort((a, b) => a.z - b.z).forEach((i) => i.desenhar());
}

/** Onde fica o balão de cada agente (acima da cabeça), em pixels de arte. */
export function ancoraDoBalao(a: Agente): Ponto {
  const pe = centroNaTela(a.posicao);
  return { x: pe.x, y: pe.y - ROBO_A - 4 };
}

/** Qual agente está sob o ponto (pixels de arte), para o clique na cena. */
export function agenteEm(agentes: Agente[], ponto: Ponto): Agente | null {
  const porFrente = [...agentes].sort((a, b) => profundidade(b.posicao) - profundidade(a.posicao));
  return (
    porFrente.find((a) => {
      const pe = centroNaTela(a.posicao);
      return Math.abs(ponto.x - pe.x) <= ROBO_L / 2 + 2 && ponto.y <= pe.y + 2 && ponto.y >= pe.y - ROBO_A - 2;
    }) ?? null
  );
}

// ---- partes ----

function losango(ctx: CanvasRenderingContext2D, t: Ponto, cor: string, elevacao = 0): void {
  const c = paraTela(t);
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - elevacao);
  ctx.lineTo(c.x + LADRILHO_L / 2, c.y + LADRILHO_A / 2 - elevacao);
  ctx.lineTo(c.x, c.y + LADRILHO_A - elevacao);
  ctx.lineTo(c.x - LADRILHO_L / 2, c.y + LADRILHO_A / 2 - elevacao);
  ctx.closePath();
  ctx.fill();
}

function piso(ctx: CanvasRenderingContext2D, p: PaletaSala): void {
  for (let y = 0; y < SALA; y++) {
    for (let x = 0; x < SALA; x++) {
      const noTapete = x >= 1 && x <= 6 && y >= 5 && y <= 7;
      losango(ctx, { x, y }, noTapete ? p.tapete : p.piso[(x + y) % 2]);
    }
  }
}

function paredes(ctx: CanvasRenderingContext2D, p: PaletaSala): void {
  const o = paraTela({ x: 0, y: 0 });
  const direita = paraTela({ x: SALA, y: 0 });
  const esquerda = paraTela({ x: 0, y: SALA });
  poligono(ctx, p.paredeEsquerda, [o, esquerda, { x: esquerda.x, y: esquerda.y - PAREDE }, { x: o.x, y: o.y - PAREDE }]);
  poligono(ctx, p.paredeDireita, [o, direita, { x: direita.x, y: direita.y - PAREDE }, { x: o.x, y: o.y - PAREDE }]);
  // rodapé
  poligono(ctx, p.rodape, [o, esquerda, { x: esquerda.x, y: esquerda.y - 3 }, { x: o.x, y: o.y - 3 }]);
  poligono(ctx, p.rodape, [o, direita, { x: direita.x, y: direita.y - 3 }, { x: o.x, y: o.y - 3 }]);
  // janela na parede da esquerda (entre os ladrilhos y = 2 e 4)
  const j1 = paraTela({ x: 0, y: 2 });
  const j2 = paraTela({ x: 0, y: 4 });
  poligono(ctx, p.rodape, [
    { x: j1.x + 1, y: j1.y - 42 },
    { x: j2.x - 1, y: j2.y - 42 },
    { x: j2.x - 1, y: j2.y - 16 },
    { x: j1.x + 1, y: j1.y - 16 },
  ]);
  poligono(ctx, p.janela, [
    { x: j1.x - 1, y: j1.y - 40 },
    { x: j2.x + 1, y: j2.y - 40 },
    { x: j2.x + 1, y: j2.y - 18 },
    { x: j1.x - 1, y: j1.y - 18 },
  ]);
  // quadro com um gráfico de barras na parede da direita (é um painel de consumo, afinal)
  const q1 = paraTela({ x: 3, y: 0 });
  const q2 = paraTela({ x: 5, y: 0 });
  poligono(ctx, '#ffffff', [
    { x: q1.x, y: q1.y - 44 },
    { x: q2.x, y: q2.y - 44 },
    { x: q2.x, y: q2.y - 20 },
    { x: q1.x, y: q1.y - 20 },
  ]);
  [8, 14, 10, 18].forEach((h, i) => {
    const b = paraTela({ x: 3.3 + i * 0.4, y: 0 });
    poligono(ctx, p.destaque, [
      { x: b.x, y: b.y - 22 - h },
      { x: b.x + 4, y: b.y - 20 - h },
      { x: b.x + 4, y: b.y - 20 },
      { x: b.x, y: b.y - 22 },
    ]);
  });
}

function mesaComMonitor(ctx: CanvasRenderingContext2D, t: Ponto, p: PaletaSala, acesa: boolean, r: Relogio): void {
  const altura = 10;
  const c = paraTela(t);
  const meioL = LADRILHO_L / 2 - 3;
  const meioA = LADRILHO_A / 2 - 1.5;
  const topo = { x: c.x, y: c.y + 3 - altura };
  // lados
  poligono(ctx, p.mesaLado[0], [
    { x: topo.x - meioL, y: topo.y + meioA },
    { x: topo.x, y: topo.y + 2 * meioA },
    { x: topo.x, y: topo.y + 2 * meioA + altura },
    { x: topo.x - meioL, y: topo.y + meioA + altura },
  ]);
  poligono(ctx, p.mesaLado[1], [
    { x: topo.x + meioL, y: topo.y + meioA },
    { x: topo.x, y: topo.y + 2 * meioA },
    { x: topo.x, y: topo.y + 2 * meioA + altura },
    { x: topo.x + meioL, y: topo.y + meioA + altura },
  ]);
  poligono(ctx, p.mesaTopo, [
    topo,
    { x: topo.x + meioL, y: topo.y + meioA },
    { x: topo.x, y: topo.y + 2 * meioA },
    { x: topo.x - meioL, y: topo.y + meioA },
  ]);
  // monitor virado para a cadeira (para a frente da sala); a tela pisca devagar enquanto o agente pensa
  const piscando = !r.reduzido && Math.floor(r.agora / 400) % 2 === 0;
  const m = { x: Math.round(topo.x - 6), y: Math.round(topo.y + meioA - 12) };
  ctx.fillStyle = p.monitor;
  ctx.fillRect(m.x, m.y, 12, 9);
  ctx.fillRect(m.x + 5, m.y + 9, 2, 3);
  ctx.fillStyle = acesa ? (piscando ? p.telaAcesa : misturar(p.telaAcesa, p.telaApagada)) : p.telaApagada;
  ctx.fillRect(m.x + 1, m.y + 1, 10, 7);
  if (acesa) {
    ctx.fillStyle = p.telaApagada;
    ctx.fillRect(m.x + 2, m.y + 3, 5, 1);
    ctx.fillRect(m.x + 2, m.y + 5, 7, 1);
  }
}

function planta(ctx: CanvasRenderingContext2D, t: Ponto, p: PaletaSala): void {
  const pe = centroNaTela(t);
  const x = Math.round(pe.x);
  const y = Math.round(pe.y);
  ctx.fillStyle = p.sombra;
  ctx.fillRect(x - 6, y - 1, 12, 2);
  ctx.fillStyle = p.vaso;
  ctx.fillRect(x - 4, y - 7, 8, 7);
  ctx.fillStyle = p.folha;
  for (const [dx, dy, l, a] of [[-6, -14, 4, 7], [-2, -19, 4, 12], [2, -15, 4, 8], [-4, -11, 8, 4]]) ctx.fillRect(x + dx, y + dy, l, a);
}

function agente(ctx: CanvasRenderingContext2D, a: Agente, p: PaletaSala, r: Relogio, selecionado: boolean): void {
  const { paleta } = personagemDe(a.codigo);
  const pe = centroNaTela(a.posicao);
  const andando = a.fase === 'INDO' || a.fase === 'VOLTANDO';
  const respira = !r.reduzido && !andando && Math.floor(r.agora / 600) % 2 === 0 ? 1 : 0;
  const pisca = !r.reduzido && r.agora % 3200 < 140;
  const sprite = andando && Math.floor(r.agora / 160) % 2 === 0 ? SPRITES.andando : pisca ? SPRITES.piscando : SPRITES.parado;

  if (selecionado) {
    const t = { x: Math.round(a.posicao.x), y: Math.round(a.posicao.y) };
    const c = paraTela(t);
    ctx.strokeStyle = p.destaque;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y + 1);
    ctx.lineTo(c.x + LADRILHO_L / 2 - 2, c.y + LADRILHO_A / 2);
    ctx.lineTo(c.x, c.y + LADRILHO_A - 1);
    ctx.lineTo(c.x - LADRILHO_L / 2 + 2, c.y + LADRILHO_A / 2);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.fillStyle = p.sombra;
  ctx.fillRect(Math.round(pe.x - 8), Math.round(pe.y - 2), 16, 3);

  const x0 = Math.round(pe.x - ROBO_L / 2);
  const y0 = Math.round(pe.y - ROBO_A) + respira;
  sprite.forEach((linha, j) => {
    for (let i = 0; i < linha.length; i++) {
      const cor = linha[i];
      if (cor === '.') continue;
      ctx.fillStyle = paleta[cor as keyof typeof paleta];
      ctx.fillRect(x0 + i * ROBO_ESCALA, y0 + j * ROBO_ESCALA, ROBO_ESCALA, ROBO_ESCALA);
    }
  });
}

function poligono(ctx: CanvasRenderingContext2D, cor: string, pontos: Ponto[]): void {
  ctx.fillStyle = cor;
  ctx.beginPath();
  pontos.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.fill();
}

/** Meio-termo entre duas cores #rrggbb (o "apagando" da tela). */
function misturar(a: string, b: string): string {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = n(a);
  const [r2, g2, b2] = n(b);
  return `rgb(${(r1 + r2) >> 1} ${(g1 + g2) >> 1} ${(b1 + b2) >> 1})`;
}
