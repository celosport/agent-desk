// Desenho da sala no Canvas 2D, em pixels de arte (o contexto já vem escalado). Tudo é desenhado por código: nada de imagens.
import { Agente } from './agente';
import { CENA_A, CENA_L, LADRILHO_A, LADRILHO_L, PAREDE, Ponto, SALA, centroNaTela, paraTela, profundidade } from './iso';
import { ACORDAR_MS, COMEMORAR_MS, Pose, desvios, poseDe } from './pose';
import { BEBEDOURO } from './vida';
import { brilhoDosMonitores, fachoDaJanela, faiscas, poeiraDosPassos, vinheta } from './luz';
import { Cara, Personagem, ROBO_ESCALA, Quadro, SPRITE_A, SPRITE_L, coresDoSprite, montarSprite, personagemDe } from './personagens';

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
  /** Cores de luz como "r g b" (para `rgb(r g b / alfa)`): facho da janela, poeira no ar e vinheta nas bordas. */
  luz: string;
  poeira: string;
  vinheta: string;
  vinhetaForca: number;
}

export const PALETAS: Record<'claro' | 'escuro', PaletaSala> = {
  claro: {
    fundo: '#f1f5fd',
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
    luz: '255 236 170',
    poeira: '255 255 255',
    vinheta: '40 60 140',
    vinhetaForca: 0.14,
  },
  escuro: {
    fundo: '#0d1224',
    piso: ['#3b342c', '#352f28'],
    tapete: '#26335f',
    paredeEsquerda: '#1b2240',
    paredeDireita: '#242c52',
    rodape: '#3b4a7a',
    mesaTopo: '#7d5a3a',
    mesaLado: ['#5c4129', '#6b4c31'],
    monitor: '#11151f',
    telaApagada: '#0b0e15',
    telaAcesa: '#22d3ee',
    vaso: '#a04a31',
    folha: '#2f7d3c',
    janela: '#17476b',
    sombra: 'rgb(0 0 0 / 0.35)',
    destaque: '#7fd8ff',
    luz: '127 180 255',
    poeira: '170 190 255',
    vinheta: '0 0 14',
    vinhetaForca: 0.38,
  },
};

/** Tempo da animação (ms) e se o movimento é reduzido (sem piscar, sem "respirar", tela sem piscar). */
export interface Relogio {
  agora: number;
  reduzido: boolean;
}

export function desenharSala(
  ctx: CanvasRenderingContext2D,
  agentes: Agente[],
  p: PaletaSala,
  r: Relogio,
  selecionado: string | null,
  visualDe: (codigo: string) => Personagem = personagemDe,
): void {
  ctx.fillStyle = p.fundo;
  ctx.fillRect(0, 0, CENA_L, CENA_A);
  paredes(ctx, p);
  piso(ctx, p);
  fachoDaJanela(ctx, p, r);
  brilhoDosMonitores(ctx, p, agentes, r);

  // Objetos e agentes juntos, do fundo para a frente
  const pensando = new Set(agentes.filter((a) => a.fase === 'PENSANDO').map((a) => a.codigo));
  const itens: { z: number; desenhar: () => void }[] = [];
  const desvio = desvios(agentes);
  for (const a of agentes) {
    const mesa = { x: a.mesa.x, y: a.mesa.y - 1 };
    itens.push({ z: profundidade(mesa), desenhar: () => mesaComMonitor(ctx, mesa, p, pensando.has(a.codigo), r) });
    itens.push({ z: profundidade(a.posicao) + 0.5, desenhar: () => agente(ctx, a, visualDe(a.codigo), p, r, a.codigo === selecionado, desvio.get(a.codigo) ?? 0) });
  }
  itens.push({ z: profundidade(BEBEDOURO), desenhar: () => bebedouro(ctx, p, r) });
  itens.push({ z: profundidade({ x: 7, y: 7 }), desenhar: () => planta(ctx, { x: 7, y: 7 }, p) });
  itens.push({ z: profundidade({ x: 0, y: 1 }), desenhar: () => planta(ctx, { x: 0, y: 1 }, p) });
  itens.sort((a, b) => a.z - b.z).forEach((i) => i.desenhar());
  vinheta(ctx, p);
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
  if (acesa) faiscas(ctx, p, m.x + 6, m.y, r);
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

function agente(ctx: CanvasRenderingContext2D, a: Agente, visual: Personagem, p: PaletaSala, r: Relogio, selecionado: boolean, desvio: number): void {
  const pose = poseDe(a, r.agora, r.reduzido);
  const pe = centroNaTela(a.posicao);
  const px = pe.x + desvio;
  const trabalhando = a.fase === 'PENSANDO' || a.fase === 'INDO';

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

  // Sombra: encolhe quando o robô sobe (pulinho, passo)
  const largura = 16 - Math.max(0, -pose.dy) * 2;
  ctx.fillStyle = p.sombra;
  ctx.fillRect(Math.round(px - largura / 2), Math.round(pe.y - 2), largura, 3);

  // Halo neon no chão enquanto trabalha
  if (trabalhando) {
    ctx.save();
    ctx.globalAlpha = r.reduzido ? 0.16 : 0.15 + 0.07 * Math.sin(r.agora / 250);
    ctx.fillStyle = p.telaAcesa;
    ctx.beginPath();
    ctx.ellipse(px, pe.y, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const x0 = Math.round(px - ROBO_L / 2) + pose.dx;
  const y0 = Math.round(pe.y - ROBO_A) + pose.dy;
  if (pose.andando) poeiraDosPassos(ctx, p, { x: px, y: pe.y }, a.caminho[0], a.posicao, r);
  const anim = r.reduzido ? 0 : Math.floor(r.agora / 120) % 4;
  desenharRobo(ctx, visual, pose.quadro, x0, y0, ROBO_ESCALA, pose.inclinar, pose.cara, pose.olhar, pose.bracosParaCima, anim);

  // A antena brilha: forte quando trabalha, respirando quando está à toa
  if (visual.antena !== 'NENHUMA') {
    ctx.save();
    ctx.globalAlpha = r.reduzido ? 0.3 : trabalhando ? 0.5 + 0.3 * Math.sin(r.agora / 160) : 0.2 + 0.12 * Math.sin(r.agora / 700);
    ctx.fillStyle = p.telaAcesa;
    ctx.beginPath();
    ctx.arc(x0 + ROBO_L / 2, y0 + 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  efeito(ctx, pose, x0, y0, p, r);
  adornosDoRobo(ctx, visual, x0, y0, p, r);
}

/** Efeitos que acompanham o acessório e a antena: notas da música, brilho da coroa, aura do halo, ondas da parabólica, faísca do raio. */
export function adornosDoRobo(ctx: CanvasRenderingContext2D, visual: Pick<Personagem, 'acessorio' | 'antena'>, x0: number, y0: number, p: PaletaSala, r: Relogio): void {
  if (r.reduzido) return;
  const t = r.agora;
  const cx = x0 + SPRITE_L / 2;
  switch (visual.acessorio) {
    case 'FONE':
      for (let i = 0; i < 2; i++) {
        const f = (t / 1400 + i / 2) % 1;
        const x = Math.round(x0 + SPRITE_L + 1 + i * 3 + Math.sin(t / 300 + i * 3) * 2);
        const y = Math.round(y0 + 8 - f * 16);
        ctx.save();
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = p.destaque;
        ctx.fillRect(x, y + 2, 2, 2);
        ctx.fillRect(x + 1, y - 1, 1, 4);
        ctx.restore();
      }
      break;
    case 'COROA': {
      const brilho = Math.max(0, Math.sin(t / 260));
      ctx.save();
      ctx.globalAlpha = brilho;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 + 4, y0 + 1, 3, 1);
      ctx.fillRect(x0 + 5, y0, 1, 3);
      ctx.restore();
      break;
    }
    case 'HALO':
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.08 * Math.sin(t / 400);
      ctx.fillStyle = '#ffe58a';
      ctx.beginPath();
      ctx.ellipse(cx, y0 + 3, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    default:
      break;
  }
  switch (visual.antena) {
    case 'PARABOLICA':
      for (let k = 0; k < 2; k++) {
        const f = (t / 900 + k / 2) % 1;
        ctx.save();
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = p.telaAcesa;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, y0 + 2, 3 + f * 9, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.restore();
      }
      break;
    case 'RAIO':
      if (Math.floor(t / 120) % 4 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 5, y0 + 3, 1, 1);
        ctx.fillRect(cx + 4, y0 + 1, 1, 1);
        ctx.fillRect(cx + 5, y0 + 4, 1, 1);
      }
      break;
    default:
      break;
  }
}

const CONFETE = ['#ffd43b', '#ff6b6b', '#51cf66', '#22d3ee', '#b197fc', '#ffa94d'];

/** Detalhes de cada pose: onda de acordar, teclas, confete, gota de suor, copo. */
function efeito(ctx: CanvasRenderingContext2D, pose: Pose, x0: number, y0: number, p: PaletaSala, r: Relogio): void {
  if (r.reduzido) return;
  const cx = x0 + ROBO_L / 2;
  switch (pose.efeito) {
    case 'ACORDAR': {
      const k = pose.t / ACORDAR_MS;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = p.telaAcesa;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, y0 + 2, 4 + k * 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'DIGITAR': {
      const alterna = Math.floor(r.agora / 90) % 2;
      ctx.fillStyle = p.telaAcesa;
      ctx.fillRect(x0 - 3, y0 + 20 + alterna * 2, 2, 2);
      ctx.fillRect(x0 + ROBO_L + 1, y0 + 22 - alterna * 2, 2, 2);
      break;
    }
    case 'COMEMORAR': {
      const k = pose.t / COMEMORAR_MS;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = CONFETE[i % CONFETE.length];
        ctx.fillRect(Math.round(cx + (i - 4.5) * 7 * k), Math.round(y0 + 4 - k * 16 + k * k * 22 + (i % 3) * 2), 2, 2);
      }
      ctx.restore();
      break;
    }
    case 'ERRO': {
      ctx.fillStyle = '#74c0fc';
      ctx.fillRect(x0 + ROBO_L + 1, y0 + 6 + (Math.floor(pose.t / 150) % 3) * 2, 2, 3);
      break;
    }
    case 'BEBER': {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 + ROBO_L - 1, y0 + 17, 3, 4);
      ctx.fillStyle = p.telaAcesa;
      ctx.fillRect(x0 + ROBO_L, y0 + 18, 1, 2);
      break;
    }
    default:
      break;
  }
}

/** Bebedouro no canto direito: um passeio dos robôs termina aqui. As bolhas sobem no galão. */
function bebedouro(ctx: CanvasRenderingContext2D, p: PaletaSala, r: Relogio): void {
  const pe = centroNaTela(BEBEDOURO);
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
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x - 3, y - 22, 1, 8);
  ctx.globalAlpha = 1;
  if (!r.reduzido) ctx.fillRect(x, y - 13 - Math.round(((r.agora / 900) % 1) * 9), 1, 1);
}

/** O robô HD, com o canto de cima à esquerda em (x0, y0). Também serve para a pré-visualização do editor. */
export function desenharRobo(
  ctx: CanvasRenderingContext2D,
  visual: Personagem,
  quadro: Quadro,
  x0: number,
  y0: number,
  escala: number,
  inclinar: -1 | 0 | 1 = 0,
  cara: Cara = 'FRENTE',
  olhar: -1 | 0 | 1 = 0,
  bracosParaCima = false,
  anim = 0,
): void {
  const cores = coresDoSprite(visual.paleta);
  montarSprite(visual, quadro, cara, olhar, bracosParaCima, anim).forEach((linha, j) => {
    for (let i = 0; i < linha.length; i++) {
      const letra = linha[i];
      if (letra === '.') continue;
      ctx.fillStyle = cores[letra];
      // cabeça e tronco se inclinam (1 px de arte) para o lado em que o robô anda
      ctx.fillRect(x0 + i * escala + (j < 16 ? inclinar * Math.max(1, escala / 2) : 0), y0 + j * escala, escala, escala);
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
