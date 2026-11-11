// O andar do Escritório: um mapa de ladrilhos com 4 ambientes ligados por um corredor (funções puras e dados, testados no Vitest).
//
//   x →  0       8 9 10     15
//   y 0  ESCRITÓRIO # c # COZINHA
//     4           # c ######
//     5           d c # BANHEIRO     d = porta (ladrilho livre na linha do muro)
//     8  ####dd###d######            # = muro baixo (corte da casinha de boneca)
//     9  DESCANSO (sala de descanso: sofá e TV)
//
// O corredor (x = 9) liga o escritório (portas em y = 5 e 6) à cozinha (porta em (10, 1)) e ao banheiro (porta em (10, 6)); a faixa de
// baixo (descanso) liga tudo pelas portas da linha y = 8. [[ADR-009 - Escritório em Canvas 2D com Motor Puro]]
import { ALTURA, CENA_A, CENA_L, LARGURA, PAREDE, Ponto, paraTela, rota } from './iso';
import { lugarDe } from './personagens';

export type Ambiente = 'ESCRITORIO' | 'CORREDOR' | 'COZINHA' | 'BANHEIRO' | 'DESCANSO';
export const AMBIENTES: readonly Ambiente[] = ['ESCRITORIO', 'COZINHA', 'BANHEIRO', 'DESCANSO'];
export const ROTULO_AMBIENTE: Record<Ambiente, string> = {
  ESCRITORIO: 'Escritório',
  CORREDOR: 'Corredor',
  COZINHA: 'Cozinha',
  BANHEIRO: 'Banheiro',
  DESCANSO: 'Sala de descanso',
};

/** Uma linha por y (de cima para baixo), uma letra por x: O escritório · c corredor · K cozinha · B banheiro · L descanso · # muro baixo · d porta. */
const LINHAS = [
  'OOOOOOOO#c#KKKKK',
  'OOOOOOOO#cdKKKKK',
  'OOOOOOOO#c#KKKKK',
  'OOOOOOOO#c#KKKKK',
  'OOOOOOOO#c######',
  'OOOOOOOOdc#BBBBB',
  'OOOOOOOOdcdBBBBB',
  'OOOOOOOO#c#BBBBB',
  '####dd###d######',
  'LLLLLLLLLLLLLLLL',
  'LLLLLLLLLLLLLLLL',
  'LLLLLLLLLLLLLLLL',
];

export const LETRA_DO_AMBIENTE: Record<string, Ambiente> = { O: 'ESCRITORIO', c: 'CORREDOR', d: 'CORREDOR', K: 'COZINHA', B: 'BANHEIRO', L: 'DESCANSO' };

export function letraEm(x: number, y: number): string {
  return LINHAS[y]?.[x] ?? '#';
}

export function dentro(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < LARGURA && y < ALTURA;
}

/** Ladrilhos de muro baixo (desenhados como blocos e intransponíveis). */
export function ehMuro(x: number, y: number): boolean {
  return letraEm(x, y) === '#';
}

export function ambienteDe(p: Ponto): Ambiente {
  const x = Math.min(LARGURA - 1, Math.max(0, Math.round(p.x)));
  const y = Math.min(ALTURA - 1, Math.max(0, Math.round(p.y)));
  return LETRA_DO_AMBIENTE[letraEm(x, y)] ?? 'CORREDOR';
}

// ---- móveis (ocupam o ladrilho: ninguém passa; só o destino da própria atividade entra) ----

/** Posições dos móveis, usadas pelo desenho e pelas rotas. */
export const MOVEIS = {
  plantas: [{ x: 7, y: 7 }, { x: 0, y: 1 }, { x: 15, y: 11 }, { x: 11, y: 7 }] as Ponto[],
  // cozinha: bancada com pia e fogão no fundo; geladeira, cafeteira e bebedouro na coluna da direita; mesa de refeição
  bancada: [{ x: 11, y: 0 }, { x: 12, y: 0 }, { x: 13, y: 0 }, { x: 14, y: 0 }] as Ponto[],
  geladeira: { x: 15, y: 0 },
  cafeteira: { x: 15, y: 1 },
  bebedouro: { x: 15, y: 2 },
  balcao: { x: 15, y: 3 },
  mesaCozinha: [{ x: 12, y: 2 }, { x: 13, y: 2 }] as Ponto[],
  // banheiro: duas cabines e a pia na coluna da direita
  cabine: { x: 15, y: 5 },
  cabine2: { x: 15, y: 6 },
  pia: { x: 15, y: 7 },
  // descanso: TV no fundo (encostada no muro), mesinha ao lado e o sofá virado para a TV (a frente do sofá fica livre para sentar)
  tv: { x: 5, y: 9 },
  mesinha: { x: 8, y: 10 },
  sofa: [{ x: 4, y: 11 }, { x: 5, y: 11 }, { x: 6, y: 11 }] as Ponto[],
};

/** Lugares onde os robôs fazem as coisas (ladrilho livre ao lado do móvel). */
export const LUGARES = {
  janela: { x: 0, y: 2 }, // embaixo da janela (parede da esquerda, y 2 a 4); longe do leitor de crachá do elevador (y ≈ 5,5 a 7,8)
  cafe: { x: 14, y: 1 },
  agua: { x: 14, y: 2 },
  pia: { x: 14, y: 7 },
  /** A cabine do banheiro: o robô entra e fecha a porta. */
  cabine: MOVEIS.cabine,
  /** Os 3 lugares do sofá. */
  sofa: MOVEIS.sofa,
};

const bloqueados = new Set<string>();
const chave = (x: number, y: number) => `${x},${y}`;
for (let i = 0; i < 8; i++) {
  const mesa = lugarDe(i).mesa;
  bloqueados.add(chave(mesa.x, mesa.y - 1)); // a mesa é desenhada no ladrilho de trás da cadeira
}
for (const p of [
  ...MOVEIS.plantas, ...MOVEIS.bancada, ...MOVEIS.mesaCozinha, ...MOVEIS.sofa,
  MOVEIS.geladeira, MOVEIS.cafeteira, MOVEIS.bebedouro, MOVEIS.balcao, MOVEIS.cabine, MOVEIS.cabine2, MOVEIS.pia, MOVEIS.tv, MOVEIS.mesinha,
]) bloqueados.add(chave(p.x, p.y));

export function livre(x: number, y: number): boolean {
  return dentro(x, y) && !ehMuro(x, y) && !bloqueados.has(chave(x, y));
}

// ---- rotas ----
const DIRECOES = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const PENA_CURVA = 0.3; // prefere caminhos retos (em "L"), que ficam mais naturais em isométrico

/**
 * Menor caminho de ladrilho em ladrilho, desviando de muros e móveis (sem o ponto de partida). Prefere trechos retos. O ladrilho de
 * destino sempre vale (é o móvel da atividade: sofá, cabine…). Sem caminho possível, cai na rota em "L" simples.
 */
export function caminhoAte(de: Ponto, ate: Ponto): Ponto[] {
  const sx = Math.min(LARGURA - 1, Math.max(0, Math.round(de.x)));
  const sy = Math.min(ALTURA - 1, Math.max(0, Math.round(de.y)));
  if (sx === ate.x && sy === ate.y) return [];

  const estados = LARGURA * ALTURA * 5;
  const dist = new Float64Array(estados).fill(Infinity);
  const anterior = new Int32Array(estados).fill(-1);
  const fechado = new Uint8Array(estados);
  const id = (x: number, y: number, d: number) => (y * LARGURA + x) * 5 + d;
  const inicio = id(sx, sy, 4);
  dist[inicio] = 0;

  for (;;) {
    let atual = -1;
    let melhor = Infinity;
    for (let i = 0; i < estados; i++) {
      if (!fechado[i] && dist[i] < melhor) {
        melhor = dist[i];
        atual = i;
      }
    }
    if (atual < 0) break;
    fechado[atual] = 1;
    const d = atual % 5;
    const celula = (atual - d) / 5;
    const x = celula % LARGURA;
    const y = Math.floor(celula / LARGURA);
    if (x === ate.x && y === ate.y) {
      const passos: Ponto[] = [];
      for (let i = atual; i !== inicio && i >= 0; i = anterior[i]) {
        const di = i % 5;
        const ci = (i - di) / 5;
        passos.push({ x: ci % LARGURA, y: Math.floor(ci / LARGURA) });
      }
      return passos.reverse();
    }
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DIRECOES[nd][0];
      const ny = y + DIRECOES[nd][1];
      if (!dentro(nx, ny) || (!livre(nx, ny) && !(nx === ate.x && ny === ate.y))) continue;
      const custo = dist[atual] + 1 + (d !== 4 && d !== nd ? PENA_CURVA : 0);
      const ni = id(nx, ny, nd);
      if (custo < dist[ni]) {
        dist[ni] = custo;
        anterior[ni] = atual;
      }
    }
  }
  return rota({ x: sx, y: sy }, ate);
}

// ---- câmera: o que mostrar ----
/** Quem acompanha o andar pode olhar tudo ou aproximar num ambiente. */
export type Foco = 'TUDO' | 'ESCRITORIO' | 'COZINHA' | 'BANHEIRO' | 'DESCANSO';
export const FOCOS: readonly { foco: Foco; rotulo: string }[] = [
  { foco: 'TUDO', rotulo: 'Andar todo' },
  { foco: 'ESCRITORIO', rotulo: 'Escritório' },
  { foco: 'COZINHA', rotulo: 'Cozinha' },
  { foco: 'BANHEIRO', rotulo: 'Banheiro' },
  { foco: 'DESCANSO', rotulo: 'Descanso' },
];

/** Retângulo da cena, em pixels de arte. */
export interface Regiao {
  x: number;
  y: number;
  l: number;
  a: number;
}

/** Ladrilhos de cada foco: [x0, y0, x1, y1] (o canto de baixo-direita é exclusivo). */
const LADRILHOS_DO_FOCO: Record<Exclude<Foco, 'TUDO'>, [number, number, number, number]> = {
  ESCRITORIO: [0, 0, 9, 9],
  COZINHA: [9, 0, LARGURA, 4],
  BANHEIRO: [9, 4, LARGURA, 8],
  DESCANSO: [0, 8, LARGURA, ALTURA],
};

export function regiaoDoFoco(foco: Foco): Regiao {
  if (foco === 'TUDO') return { x: 0, y: 0, l: CENA_L, a: CENA_A };
  const [x0, y0, x1, y1] = LADRILHOS_DO_FOCO[foco];
  const esquerda = Math.max(0, paraTela({ x: x0, y: y1 }).x - 18);
  const direita = Math.min(CENA_L, paraTela({ x: x1, y: y0 }).x + 18);
  const topo = Math.max(0, paraTela({ x: x0, y: y0 }).y - PAREDE - 6);
  const baixo = Math.min(CENA_A, paraTela({ x: x1, y: y1 }).y + 10);
  return { x: esquerda, y: topo, l: direita - esquerda, a: baixo - topo };
}
