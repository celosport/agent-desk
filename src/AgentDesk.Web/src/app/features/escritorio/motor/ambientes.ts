// O andar por dentro: piso de cada ambiente, muros baixos, móveis da cozinha, do banheiro e da sala de descanso (sofá e TV), plantas.
// Tudo desenhado por código no Canvas 2D, em pixels de arte, e devolvido como itens com profundidade (z) para serem
// misturados com os robôs na ordem certa — [[ADR-009 - Escritório em Canvas 2D com Motor Puro]].
import type { Agente } from './agente';
import type { PaletaSala, Relogio } from './desenho';
import { ALTURA, LADRILHO_A, LADRILHO_L, LARGURA, Ponto, centroNaTela, paraTela, profundidade } from './iso';
import { MOVEIS, ROTULO_AMBIENTE, ehMuro, letraEm } from './mapa';
import { rgbDe } from './luz';
import { cabineOcupada } from './pose';

export interface ItemDeCena {
  z: number;
  desenhar: () => void;
}

// ---- cores ----
/** Mistura `hex` com `alvo` (#rrggbb): k = 0 é a cor original, k = 1 é o alvo. */
function tom(hex: string, alvo: string, k: number): string {
  const n = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const m = (i: number) => Math.round(n(hex, i) + (n(alvo, i) - n(hex, i)) * k);
  return `rgb(${m(1)} ${m(3)} ${m(5)})`;
}
const claro = (hex: string, k = 0.25) => tom(hex, '#ffffff', k);
const escuro = (hex: string, k = 0.25) => tom(hex, '#000000', k);

// ---- geometria ----
function poligono(ctx: CanvasRenderingContext2D, cor: string, pts: Ponto[]): void {
  ctx.fillStyle = cor;
  ctx.beginPath();
  pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.fill();
}

function losango(ctx: CanvasRenderingContext2D, t: Ponto, cor: string): void {
  const c = paraTela(t);
  poligono(ctx, cor, [
    { x: c.x, y: c.y },
    { x: c.x + LADRILHO_L / 2, y: c.y + LADRILHO_A / 2 },
    { x: c.x, y: c.y + LADRILHO_A },
    { x: c.x - LADRILHO_L / 2, y: c.y + LADRILHO_A / 2 },
  ]);
}

/** Caixa que ocupa o ladrilho `t` (recuada `folga` px), do chão (`base`) até `altura`. O topo é mais claro; os lados, mais escuros. */
function bloco(ctx: CanvasRenderingContext2D, t: Ponto, altura: number, cor: string, opcoes: { topo?: string; folga?: number; base?: number } = {}): void {
  const { folga = 0, base = 0 } = opcoes;
  const cx = paraTela(t).x;
  const cy = paraTela(t).y + LADRILHO_A / 2;
  const hl = LADRILHO_L / 2 - folga * 2;
  const ha = LADRILHO_A / 2 - folga;
  poligono(ctx, escuro(cor, 0.18), [
    { x: cx - hl, y: cy - altura },
    { x: cx, y: cy - altura + ha },
    { x: cx, y: cy - base + ha },
    { x: cx - hl, y: cy - base },
  ]);
  poligono(ctx, escuro(cor, 0.34), [
    { x: cx, y: cy - altura + ha },
    { x: cx + hl, y: cy - altura },
    { x: cx + hl, y: cy - base },
    { x: cx, y: cy - base + ha },
  ]);
  poligono(ctx, opcoes.topo ?? claro(cor, 0.22), [
    { x: cx, y: cy - altura - ha },
    { x: cx + hl, y: cy - altura },
    { x: cx, y: cy - altura + ha },
    { x: cx - hl, y: cy - altura },
  ]);
}

/** Ponto sobre a face de baixo-esquerda de uma caixa (u: 0 a 1 ao longo da face; v: 0 no topo, 1 na base). */
function naFaceEsquerda(t: Ponto, folga: number, hTopo: number, hBase: number, u: number, v: number): Ponto {
  const cx = paraTela(t).x;
  const cy = paraTela(t).y + LADRILHO_A / 2;
  const hl = LADRILHO_L / 2 - folga * 2;
  const ha = LADRILHO_A / 2 - folga;
  const x = cx - hl + hl * u;
  const y = cy - hTopo + ha * u + (hTopo - hBase) * v;
  return { x, y };
}

function faceEsquerda(ctx: CanvasRenderingContext2D, cor: string, t: Ponto, folga: number, hTopo: number, hBase: number, u0: number, u1: number, v0: number, v1: number): void {
  poligono(ctx, cor, [
    naFaceEsquerda(t, folga, hTopo, hBase, u0, v0),
    naFaceEsquerda(t, folga, hTopo, hBase, u1, v0),
    naFaceEsquerda(t, folga, hTopo, hBase, u1, v1),
    naFaceEsquerda(t, folga, hTopo, hBase, u0, v1),
  ]);
}

// ---- piso ----
/** Piso de cada ambiente: o escritório (com tapete), o corredor, a cozinha, o banheiro e a sala de descanso (com tapete e xadrez roxo). */
export function pisoDoAndar(ctx: CanvasRenderingContext2D, p: PaletaSala): void {
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      const par = (x + y) % 2;
      let cor: string;
      switch (letraEm(x, y)) {
        case 'O':
          cor = x >= 1 && x <= 6 && y >= 5 && y <= 7 ? p.tapete : p.piso[par];
          break;
        case 'K':
          cor = p.pisoCozinha[par];
          break;
        case 'B':
          cor = p.pisoBanheiro[par];
          break;
        case 'L':
          cor = x >= 3 && x <= 7 && y >= 9 ? p.tapete : p.pisoDescanso[par];
          break;
        default:
          cor = p.pisoCorredor[par]; // corredor, portas e a base dos muros
      }
      losango(ctx, { x, y }, cor);
    }
  }
}

/** Nome de cada ambiente, escrito de leve no chão. */
export function rotulosDosAmbientes(ctx: CanvasRenderingContext2D, p: PaletaSala): void {
  ctx.save();
  ctx.font = '700 6px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgb(${rgbDe(p.destaque)} / 0.55)`;
  const lugares: [keyof typeof ROTULO_AMBIENTE, Ponto][] = [
    ['COZINHA', { x: 13, y: 3.6 }],
    ['BANHEIRO', { x: 13, y: 7.4 }],
    ['DESCANSO', { x: 11.5, y: 10.6 }],
  ];
  for (const [amb, t] of lugares) {
    const c = paraTela(t);
    ctx.fillText(ROTULO_AMBIENTE[amb].toUpperCase(), c.x, c.y + LADRILHO_A / 2);
  }
  ctx.restore();
}

// ---- móveis ----
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

function bebedouro(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto, r: Relogio): void {
  const pe = centroNaTela(t);
  const x = Math.round(pe.x);
  const y = Math.round(pe.y);
  ctx.fillStyle = p.sombra;
  ctx.fillRect(x - 7, y - 1, 14, 2);
  ctx.fillStyle = p.monitor;
  ctx.fillRect(x - 5, y - 12, 10, 11);
  ctx.fillStyle = p.rodape;
  ctx.fillRect(x - 5, y - 12, 10, 2);
  ctx.fillStyle = p.telaAcesa;
  ctx.fillRect(x - 1, y - 7, 2, 2);
  ctx.fillStyle = p.janela;
  ctx.fillRect(x - 4, y - 23, 8, 11);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3, y - 22, 1, 8);
  ctx.restore();
  if (!r.reduzido) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y - 13 - Math.round(((r.agora / 900) % 1) * 9), 1, 1);
  }
}

function cafeteira(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto, r: Relogio, fumaca: boolean): void {
  bloco(ctx, t, 10, p.cozinhaLado, { topo: p.cozinhaTopo, folga: 1 });
  const pe = centroNaTela(t);
  const x = Math.round(pe.x);
  const y = Math.round(pe.y) - 10;
  ctx.fillStyle = p.monitor;
  ctx.fillRect(x - 4, y - 15, 8, 14);
  ctx.fillStyle = p.rodape;
  ctx.fillRect(x - 4, y - 15, 8, 2);
  ctx.fillStyle = fumaca ? '#51cf66' : '#ff6b6b';
  ctx.fillRect(x + 1, y - 10, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2, y - 4, 3, 2);
  if (fumaca && !r.reduzido) {
    const f = (r.agora / 800) % 1;
    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - f);
    ctx.fillRect(x - 1 + Math.round(Math.sin(r.agora / 250)), Math.round(y - 17 - f * 8), 1, 2);
    ctx.restore();
  }
}

function geladeira(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto): void {
  bloco(ctx, t, 38, p.cozinhaTopo, { topo: claro(p.cozinhaTopo, 0.3), folga: 2 });
  // porta de cima (freezer) e de baixo, com puxadores
  faceEsquerda(ctx, escuro(p.cozinhaTopo, 0.35), t, 2, 38, 0, 0.04, 0.96, 0.34, 0.37);
  faceEsquerda(ctx, p.monitor, t, 2, 38, 0, 0.78, 0.86, 0.1, 0.24);
  faceEsquerda(ctx, p.monitor, t, 2, 38, 0, 0.78, 0.86, 0.45, 0.6);
}

/** Pia da cozinha/banheiro: cuba escura e torneira sobre a bancada. */
function pia(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto, altura: number): void {
  const c = paraTela(t);
  const cy = c.y + LADRILHO_A / 2 - altura;
  poligono(ctx, p.telaApagada, [{ x: c.x, y: cy - 4 }, { x: c.x + 9, y: cy }, { x: c.x, y: cy + 4 }, { x: c.x - 9, y: cy }]);
  ctx.fillStyle = p.rodape;
  ctx.fillRect(Math.round(c.x) - 1, Math.round(cy) - 9, 2, 6);
  ctx.fillRect(Math.round(c.x) - 3, Math.round(cy) - 9, 4, 1);
}

function fogao(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto): void {
  const c = paraTela(t);
  const cy = c.y + LADRILHO_A / 2 - 14;
  for (const [dx, dy] of [[-5, -1], [5, 1], [0, -3], [0, 3]]) {
    poligono(ctx, p.telaApagada, [{ x: c.x + dx, y: cy + dy - 2 }, { x: c.x + dx + 4, y: cy + dy }, { x: c.x + dx, y: cy + dy + 2 }, { x: c.x + dx - 4, y: cy + dy }]);
  }
}

/** Cabine do banheiro: caixa alta com porta e a luz de "ocupado" (vermelha) / "livre" (verde). */
function cabine(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto, ocupada: boolean): void {
  const cor = tom(p.paredeEsquerda, '#ffffff', 0.15);
  bloco(ctx, t, 32, cor, { topo: claro(cor, 0.3), folga: 1 });
  faceEsquerda(ctx, escuro(cor, 0.4), t, 1, 32, 0, 0.12, 0.88, 0.12, 0.98); // a porta
  faceEsquerda(ctx, ocupada ? '#ff6b6b' : '#51cf66', t, 1, 32, 0, 0.42, 0.58, 0.18, 0.28);
}

function mesaDaCozinha(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto): void {
  bloco(ctx, t, 9, p.mesaLado[1], { topo: p.mesaTopo, folga: 1 });
}

function tv(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto, r: Relogio): void {
  bloco(ctx, t, 8, p.monitor, { folga: 5 });
  bloco(ctx, t, 26, p.monitor, { folga: 1, base: 8 });
  const cores = ['#74c0fc', '#ff8cc6', '#ffd43b', '#63e6be'];
  const cor = r.reduzido ? cores[0] : cores[Math.floor(r.agora / 900) % cores.length];
  faceEsquerda(ctx, cor, t, 1, 26, 8, 0.1, 0.9, 0.1, 0.9); // a tela, virada para o sofá
  faceEsquerda(ctx, 'rgb(255 255 255 / 0.18)', t, 1, 26, 8, 0.1, 0.9, 0.1, 0.4);
}

function mesinha(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto): void {
  bloco(ctx, t, 7, p.mesaLado[1], { topo: p.mesaTopo, folga: 3 });
  const c = paraTela(t);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y + LADRILHO_A / 2) - 11, 3, 3);
}

/** Assento do sofá (desenhado ANTES do robô sentado). */
function assentoDoSofa(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto): void {
  bloco(ctx, t, 8, p.sofa, { topo: claro(p.sofa, 0.18), folga: 1 });
}

/** Encosto do sofá: uma faixa na beira de baixo do ladrilho, desenhada DEPOIS do robô — ele fica "sentado atrás" dela. */
function encostoDoSofa(ctx: CanvasRenderingContext2D, p: PaletaSala, t: Ponto): void {
  const c = paraTela(t);
  const e = { x: c.x - LADRILHO_L / 2, y: c.y + LADRILHO_A / 2 }; // vértice da esquerda
  const b = { x: c.x, y: c.y + LADRILHO_A }; // vértice de baixo
  const h = 21;
  poligono(ctx, p.sofaEscuro, [e, b, { x: b.x, y: b.y - h }, { x: e.x, y: e.y - h }]);
  poligono(ctx, p.sofa, [{ x: e.x, y: e.y - h }, { x: b.x, y: b.y - h }, { x: b.x + 4, y: b.y - h - 2 }, { x: e.x + 4, y: e.y - h - 2 }]);
}

/** A luz da TV no chão, na frente dela (mais forte quando tem alguém no sofá). */
function luzDaTV(ctx: CanvasRenderingContext2D, p: PaletaSala, r: Relogio, alguemAssistindo: boolean): void {
  const c = centroNaTela({ x: MOVEIS.tv.x, y: MOVEIS.tv.y + 1.4 });
  const forca = (alguemAssistindo ? 0.3 : 0.14) + (r.reduzido ? 0 : 0.05 * Math.sin(r.agora / 300));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 44);
  g.addColorStop(0, `rgb(${rgbDe(p.telaAcesa)} / ${forca.toFixed(2)})`);
  g.addColorStop(1, `rgb(${rgbDe(p.telaAcesa)} / 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Todos os itens do andar (muros, móveis, plantas) com a profundidade para ordenar junto com os robôs. */
export function itensDoAndar(ctx: CanvasRenderingContext2D, p: PaletaSala, r: Relogio, agentes: Agente[]): ItemDeCena[] {
  const itens: ItemDeCena[] = [];
  const add = (t: Ponto, f: () => void, dz = 0) => itens.push({ z: profundidade(t) + dz, desenhar: f });

  // muros baixos
  for (let y = 0; y < ALTURA; y++) for (let x = 0; x < LARGURA; x++) if (ehMuro(x, y)) add({ x, y }, () => bloco(ctx, { x, y }, 11, p.muro, { topo: p.muroTopo }));

  // cozinha
  const tomandoCafe = agentes.some((a) => (a.fase === 'PAUSA' && a.pausa === 'CAFE') || (a.fase === 'OCIOSO' && a.vida.acao === 'PARADO' && a.vida.motivo === 'CAFE'));
  for (const t of MOVEIS.bancada) add(t, () => bloco(ctx, t, 14, p.cozinhaLado, { topo: p.cozinhaTopo, folga: 1 }));
  add(MOVEIS.bancada[0], () => pia(ctx, p, MOVEIS.bancada[0], 14), 0.1);
  add(MOVEIS.bancada[2], () => fogao(ctx, p, MOVEIS.bancada[2]), 0.1);
  add(MOVEIS.geladeira, () => geladeira(ctx, p, MOVEIS.geladeira));
  add(MOVEIS.cafeteira, () => cafeteira(ctx, p, MOVEIS.cafeteira, r, tomandoCafe));
  add(MOVEIS.bebedouro, () => bebedouro(ctx, p, MOVEIS.bebedouro, r));
  add(MOVEIS.balcao, () => bloco(ctx, MOVEIS.balcao, 10, p.cozinhaLado, { topo: p.cozinhaTopo, folga: 1 }));
  for (const t of MOVEIS.mesaCozinha) add(t, () => mesaDaCozinha(ctx, p, t));

  // banheiro
  const ocupada = cabineOcupada(agentes, r.agora);
  add(MOVEIS.cabine, () => cabine(ctx, p, MOVEIS.cabine, ocupada));
  add(MOVEIS.cabine2, () => cabine(ctx, p, MOVEIS.cabine2, false));
  add(MOVEIS.pia, () => {
    bloco(ctx, MOVEIS.pia, 14, p.cozinhaLado, { topo: p.cozinhaTopo, folga: 1 });
    pia(ctx, p, MOVEIS.pia, 14);
  });

  // sala de descanso
  const assistindo = agentes.some((a) => (a.fase === 'PAUSA' && a.pausa === 'SOFA') || (a.fase === 'OCIOSO' && a.vida.acao === 'PARADO' && a.vida.motivo === 'SOFA'));
  add(MOVEIS.tv, () => luzDaTV(ctx, p, r, assistindo), -3);
  add(MOVEIS.tv, () => tv(ctx, p, MOVEIS.tv, r));
  add(MOVEIS.mesinha, () => mesinha(ctx, p, MOVEIS.mesinha));
  for (const t of MOVEIS.sofa) {
    add(t, () => assentoDoSofa(ctx, p, t));
    add(t, () => encostoDoSofa(ctx, p, t), 0.9);
  }

  for (const t of MOVEIS.plantas) add(t, () => planta(ctx, t, p));
  return itens;
}
