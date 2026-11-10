// Luz e partículas da sala (Canvas 2D): facho da janela com poeira no ar, brilho dos monitores no chão, faíscas, poeira dos passos
// e vinheta. Tudo é função do tempo (nada de estado entre quadros), então não precisa de motor nem de memória — [[ADR-009 - Escritório em Canvas 2D com Motor Puro]].
import type { Agente } from './agente';
import type { PaletaSala, Relogio } from './desenho';
import { CENA_A, CENA_L, Ponto, centroNaTela, paraTela } from './iso';

/** "#rrggbb" → "r g b" (para montar `rgb(r g b / alfa)`). */
export function rgbDe(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

/** Número 0..1 fixo para (i, k): a "aleatoriedade" das partículas é determinística. */
function ruido(i: number, k: number): number {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function poligono(ctx: CanvasRenderingContext2D, pts: Ponto[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** Facho de luz da janela caindo no chão, com poeira flutuando nele. Desenhar depois do piso e antes dos objetos. */
export function fachoDaJanela(ctx: CanvasRenderingContext2D, p: PaletaSala, r: Relogio): void {
  const pts = [paraTela({ x: 0, y: 2 }), paraTela({ x: 0, y: 4 }), paraTela({ x: 3.6, y: 5.4 }), paraTela({ x: 3.6, y: 3.4 })];
  const de = paraTela({ x: 0, y: 3 });
  const ate = paraTela({ x: 3.6, y: 4.4 });
  const g = ctx.createLinearGradient(de.x, de.y, ate.x, ate.y);
  g.addColorStop(0, `rgb(${p.luz} / 0.3)`);
  g.addColorStop(1, `rgb(${p.luz} / 0)`);
  ctx.fillStyle = g;
  poligono(ctx, pts);
  ctx.fill();

  // Poeira: 18 grãos que derivam devagar dentro do facho e piscam
  for (let i = 0; i < 18; i++) {
    const t = r.reduzido ? 0 : r.agora;
    const x = 0.5 + ruido(i, 1) * 2.9 + Math.sin(t / 2600 + i) * 0.2;
    const y = 2.4 + x * 0.34 + ruido(i, 2) * 1.5 + Math.cos(t / 3100 + i * 1.7) * 0.12;
    const s = paraTela({ x, y });
    const alto = r.reduzido ? 0 : ((t / 120 + i * 13) % 18);
    const alfa = r.reduzido ? 0.35 : 0.2 + 0.4 * Math.max(0, Math.sin(t / 520 + i * 2.1));
    ctx.fillStyle = `rgb(${p.poeira} / ${alfa.toFixed(2)})`;
    ctx.fillRect(Math.round(s.x), Math.round(s.y - alto), 1, 1);
  }
}

/** Brilho da tela de quem está trabalhando, espalhado no chão em volta da mesa. */
export function brilhoDosMonitores(ctx: CanvasRenderingContext2D, p: PaletaSala, agentes: Agente[], r: Relogio): void {
  for (const a of agentes) {
    if (a.fase !== 'PENSANDO') continue;
    const c = centroNaTela({ x: a.mesa.x, y: a.mesa.y - 0.35 });
    const forca = r.reduzido ? 0.22 : 0.2 + 0.07 * Math.sin(r.agora / 260);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, `rgb(${rgbDe(p.telaAcesa)} / ${forca.toFixed(2)})`);
    g.addColorStop(1, `rgb(${rgbDe(p.telaAcesa)} / 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Faíscas subindo do monitor aceso (3 por tela). */
export function faiscas(ctx: CanvasRenderingContext2D, p: PaletaSala, x: number, y: number, r: Relogio): void {
  if (r.reduzido) return;
  for (let i = 0; i < 3; i++) {
    const fase = (r.agora / 800 + i / 3) % 1;
    ctx.fillStyle = `rgb(${rgbDe(p.telaAcesa)} / ${(1 - fase).toFixed(2)})`;
    ctx.fillRect(Math.round(x + (i - 1) * 4 + Math.sin(r.agora / 300 + i * 2) * 1.5), Math.round(y - fase * 11), 1, 1);
  }
}

/** Poeirinha atrás de quem anda: três nuvens que somem, só no momento em que o pé toca o chão. */
export function poeiraDosPassos(ctx: CanvasRenderingContext2D, p: PaletaSala, pe: Ponto, alvo: Ponto | undefined, posicao: Ponto, r: Relogio): void {
  if (r.reduzido || !alvo || Math.floor(r.agora / 120) % 2 !== 0) return;
  const dx = alvo.x - posicao.x - (alvo.y - posicao.y);
  const dy = (alvo.x - posicao.x + (alvo.y - posicao.y)) / 2;
  const n = Math.hypot(dx, dy) || 1;
  for (let k = 1; k <= 3; k++) {
    ctx.fillStyle = `rgb(${p.poeira} / ${(0.34 - k * 0.08).toFixed(2)})`;
    const raio = 2.6 - k * 0.5;
    ctx.beginPath();
    ctx.arc(pe.x - (dx / n) * k * 5, pe.y - (dy / n) * k * 5 - 1, raio, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Escurecimento suave nas bordas: dá profundidade e prende o olhar na sala. Desenhar por último. */
export function vinheta(ctx: CanvasRenderingContext2D, p: PaletaSala): void {
  const g = ctx.createRadialGradient(CENA_L / 2, CENA_A * 0.55, CENA_A * 0.3, CENA_L / 2, CENA_A * 0.55, CENA_L * 0.78);
  g.addColorStop(0, `rgb(${p.vinheta} / 0)`);
  g.addColorStop(1, `rgb(${p.vinheta} / ${p.vinhetaForca})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CENA_L, CENA_A);
}
