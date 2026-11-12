// Enquadramento da foto de perfil: matemática pura (testável) usada pelo recortador.
// O quadro é um quadrado de `tamanho` px. A imagem sempre COBRE o quadro (sem bordas vazias) e o usuário
// ajusta o zoom, a rotação (de 90 em 90°) e a posição arrastando.

export interface EstadoRecorte {
  larguraImg: number;
  alturaImg: number;
  /** 0, 1, 2 ou 3 giros de 90° no sentido horário. */
  rotacao: number;
  /** 1 = a imagem cobre o quadro; até {@link ZOOM_MAXIMO}. */
  zoom: number;
  /** Deslocamento do centro da imagem em relação ao centro do quadro, em px do quadro. */
  deslocX: number;
  deslocY: number;
  tamanho: number;
}

export const ZOOM_MINIMO = 1;
export const ZOOM_MAXIMO = 4;

/** Largura e altura da imagem depois de girar (troca nos giros ímpares). */
export function dimensoesGiradas(e: Pick<EstadoRecorte, 'larguraImg' | 'alturaImg' | 'rotacao'>): { largura: number; altura: number } {
  return e.rotacao % 2 === 0 ? { largura: e.larguraImg, altura: e.alturaImg } : { largura: e.alturaImg, altura: e.larguraImg };
}

/** Escala que faz a imagem cobrir o quadro (zoom 1) e a escala total com o zoom aplicado. */
export function escalas(e: EstadoRecorte): { base: number; total: number } {
  const { largura, altura } = dimensoesGiradas(e);
  const base = e.tamanho / Math.min(largura, altura);
  return { base, total: base * clamp(e.zoom, ZOOM_MINIMO, ZOOM_MAXIMO) };
}

/** Mantém a imagem cobrindo o quadro: o deslocamento máximo é a sobra de cada lado. */
export function limitarDeslocamento(e: EstadoRecorte): { x: number; y: number } {
  const { largura, altura } = dimensoesGiradas(e);
  const { total } = escalas(e);
  const maxX = Math.max(0, (largura * total - e.tamanho) / 2);
  const maxY = Math.max(0, (altura * total - e.tamanho) / 2);
  return { x: clamp(e.deslocX, -maxX, maxX), y: clamp(e.deslocY, -maxY, maxY) };
}

/** Estado inicial: centralizado, zoom 1, sem giro. */
export function recorteInicial(larguraImg: number, alturaImg: number, tamanho: number): EstadoRecorte {
  return { larguraImg, alturaImg, rotacao: 0, zoom: 1, deslocX: 0, deslocY: 0, tamanho };
}

export function clamp(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}
