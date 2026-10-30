// Máquina de estados de um agente do Escritório (funções puras, testadas no Vitest). O tempo vem de fora (ms), nunca de Date.now().
import { Ponto, andar, rota } from './iso';

/**
 * OCIOSO (no seu canto) → INDO (andando até a mesa) → PENSANDO (balão "pensando…") → RESULTADO (balão com tokens e custo)
 * → VOLTANDO → OCIOSO. Com movimento reduzido, não anda: aparece direto na mesa e volta direto para o canto.
 */
export type Fase = 'OCIOSO' | 'INDO' | 'PENSANDO' | 'RESULTADO' | 'VOLTANDO';

export interface Balao {
  /** atividade/alerta: sessões do Claude Code ("📖 Lendo api.ts", "✋ Precisa de você"). */
  tipo: 'pensando' | 'resultado' | 'erro' | 'atividade' | 'alerta';
  texto: string;
}

export interface Agente {
  codigo: string;
  canto: Ponto;
  mesa: Ponto;
  posicao: Ponto;
  caminho: Ponto[];
  fase: Fase;
  /** Quando entrou na fase atual (ms). */
  desde: number;
  balao: Balao | null;
  /** Resultado que chegou antes de o agente sentar: aparece quando ele chega. */
  pendente: Balao | null;
}

export const VELOCIDADE = 3; // ladrilhos por segundo
export const PENSANDO_MINIMO_MS = 700; // o balão "pensando…" não pisca e some
export const RESULTADO_MS = 9000; // quanto tempo o balão do resultado fica
export const BALAO_PENSANDO: Balao = { tipo: 'pensando', texto: 'pensando…' };
/** Quanto tempo o balão de "terminou" fica quando uma sessão do Claude Code libera o robô. */
export const LIBERAR_MS = 4000;

export function novoAgente(codigo: string, canto: Ponto, mesa: Ponto): Agente {
  return { codigo, canto, mesa, posicao: { ...canto }, caminho: [], fase: 'OCIOSO', desde: 0, balao: null, pendente: null };
}

export function ocupado(a: Agente): boolean {
  return a.fase === 'INDO' || a.fase === 'PENSANDO';
}

/** Começou uma execução: vai para a mesa (ou aparece nela, com movimento reduzido). */
export function iniciarTarefa(a: Agente, agora: number, reduzido: boolean): Agente {
  if (reduzido || igual(a.posicao, a.mesa)) {
    return { ...a, posicao: { ...a.mesa }, caminho: [], fase: 'PENSANDO', desde: agora, balao: BALAO_PENSANDO, pendente: null };
  }
  return { ...a, caminho: rota(a.posicao, a.mesa), fase: 'INDO', desde: agora, balao: null, pendente: null };
}

/** A execução terminou (sucesso ou erro). Se ainda está andando, guarda para mostrar ao sentar. */
export function concluirTarefa(a: Agente, balao: Balao, agora: number): Agente {
  if (a.fase === 'INDO') return { ...a, pendente: balao };
  if (a.fase === 'PENSANDO') {
    // Sem sumir antes do mínimo: quem chamar avancar() depois troca o balão
    return agora - a.desde >= PENSANDO_MINIMO_MS ? { ...a, fase: 'RESULTADO', desde: agora, balao, pendente: null } : { ...a, pendente: balao };
  }
  return { ...a, fase: 'RESULTADO', desde: agora, balao, pendente: null };
}

/** Um passo de tempo. Devolve o mesmo objeto se nada mudou (o desenho pode comparar por referência). */
export function avancar(a: Agente, agora: number, dtMs: number, reduzido: boolean): Agente {
  switch (a.fase) {
    case 'INDO':
    case 'VOLTANDO': {
      if (reduzido) return chegar(a, agora);
      const passo = andar(a.posicao, a.caminho, (VELOCIDADE * dtMs) / 1000);
      const andou = { ...a, posicao: passo.posicao, caminho: passo.caminho };
      return passo.caminho.length ? andou : chegar(andou, agora);
    }
    case 'PENSANDO':
      if (a.pendente && agora - a.desde >= PENSANDO_MINIMO_MS) {
        return { ...a, fase: 'RESULTADO', desde: agora, balao: a.pendente, pendente: null };
      }
      return a;
    case 'RESULTADO':
      if (agora - a.desde < RESULTADO_MS) return a;
      if (reduzido) return { ...a, posicao: { ...a.canto }, caminho: [], fase: 'OCIOSO', desde: agora, balao: null };
      return { ...a, caminho: rota(a.posicao, a.canto), fase: 'VOLTANDO', desde: agora, balao: null };
    default:
      return a;
  }
}

/** Termina o trabalho por fora (sessão do Claude Code ficou ociosa): mostra o balão um pouco e volta para o canto. */
export function liberar(a: Agente, balao: Balao, agora: number): Agente {
  return { ...a, fase: 'RESULTADO', desde: agora - (RESULTADO_MS - LIBERAR_MS), balao, pendente: null };
}

function chegar(a: Agente, agora: number): Agente {
  if (a.fase === 'INDO') {
    // Quem já tem um balão (atividade de uma sessão) mantém; as automações chegam e mostram "pensando…"
    return { ...a, posicao: { ...a.mesa }, caminho: [], fase: 'PENSANDO', desde: agora, balao: a.balao ?? BALAO_PENSANDO };
  }
  return { ...a, posicao: { ...a.canto }, caminho: [], fase: 'OCIOSO', desde: agora, balao: null };
}

function igual(p: Ponto, q: Ponto): boolean {
  return Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
}

/** Texto do status para leitores de tela (a região aria-live da página). */
export function descreverFase(a: Agente): string {
  switch (a.fase) {
    case 'INDO':
      return 'indo para a mesa';
    case 'PENSANDO':
      return 'pensando…';
    case 'RESULTADO':
      return a.balao?.tipo === 'erro' ? `erro: ${a.balao.texto}` : `terminou: ${a.balao?.texto ?? ''}`;
    case 'VOLTANDO':
      return 'voltando para o seu canto';
    default:
      return 'disponível';
  }
}
