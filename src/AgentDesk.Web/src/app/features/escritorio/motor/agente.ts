// Máquina de estados de um agente do Escritório (funções puras, testadas no Vitest). O tempo vem de fora (ms), nunca de Date.now().
import { Ponto, andar, rota } from './iso';
import { VELOCIDADE_PASSEIO, VIDA_INICIAL, Vida, escolherPasseio, esperaOciosa, fatorDeVelocidade, restante } from './vida';

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
  /** O que o robô faz quando está sem tarefa (passeio, janela, bebedouro…) — [[Frontend (Angular PWA)]]. */
  vida: Vida;
}

export const VELOCIDADE = 3; // ladrilhos por segundo
export const PENSANDO_MINIMO_MS = 700; // o balão "pensando…" não pisca e some
export const RESULTADO_MS = 9000; // quanto tempo o balão do resultado fica
export const BALAO_PENSANDO: Balao = { tipo: 'pensando', texto: 'pensando…' };
/** Quanto tempo o balão de "terminou" fica quando uma sessão do Claude Code libera o robô. */
export const LIBERAR_MS = 4000;

export function novoAgente(codigo: string, canto: Ponto, mesa: Ponto): Agente {
  return { codigo, canto, mesa, posicao: { ...canto }, caminho: [], fase: 'OCIOSO', desde: 0, balao: null, pendente: null, vida: VIDA_INICIAL };
}

export function ocupado(a: Agente): boolean {
  return a.fase === 'INDO' || a.fase === 'PENSANDO';
}

/** Começou uma execução: vai para a mesa (ou aparece nela, com movimento reduzido). */
export function iniciarTarefa(a: Agente, agora: number, reduzido: boolean): Agente {
  if (reduzido || igual(a.posicao, a.mesa)) {
    return { ...a, posicao: { ...a.mesa }, caminho: [], fase: 'PENSANDO', desde: agora, balao: BALAO_PENSANDO, pendente: null, vida: semVida(a) };
  }
  return { ...a, caminho: rota(a.posicao, a.mesa), fase: 'INDO', desde: agora, balao: null, pendente: null, vida: semVida(a) };
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
      const fator = fatorDeVelocidade(agora - a.desde, restante(a.posicao, a.caminho));
      const passo = andar(a.posicao, a.caminho, (VELOCIDADE * fator * dtMs) / 1000);
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
      if (reduzido) return { ...a, posicao: { ...a.canto }, caminho: [], fase: 'OCIOSO', desde: agora, balao: null, vida: semVida(a) };
      return { ...a, caminho: rota(a.posicao, a.canto), fase: 'VOLTANDO', desde: agora, balao: null };
    default:
      return viver(a, agora, dtMs, reduzido);
  }
}

/** Sem tarefa: de vez em quando o robô tem uma vontade (janela, bebedouro, espreguiçar) e depois volta para o canto. */
function viver(a: Agente, agora: number, dtMs: number, reduzido: boolean): Agente {
  if (a.fase !== 'OCIOSO' || reduzido) return a;
  const v = a.vida;
  switch (v.acao) {
    case 'NENHUMA': {
      if (v.ate === 0) return { ...a, vida: { ...v, ate: agora + esperaOciosa(a.codigo, v.contador) } };
      if (agora < v.ate) return a;
      const p = escolherPasseio(a.codigo, v.contador);
      const caminho = p.destino ? rota(a.posicao, p.destino) : [];
      const vida = { ...v, motivo: p.motivo, desde: agora, parado: p.parado, contador: v.contador + 1 };
      return caminho.length
        ? { ...a, caminho, vida: { ...vida, acao: 'INDO' } }
        : { ...a, vida: { ...vida, acao: 'PARADO', ate: agora + p.parado } };
    }
    case 'INDO':
    case 'VOLTANDO': {
      const passo = andar(a.posicao, a.caminho, (VELOCIDADE_PASSEIO * fatorDeVelocidade(agora - v.desde, restante(a.posicao, a.caminho)) * dtMs) / 1000);
      if (passo.caminho.length) return { ...a, posicao: passo.posicao, caminho: passo.caminho };
      if (v.acao === 'INDO') return { ...a, posicao: passo.posicao, caminho: [], vida: { ...v, acao: 'PARADO', desde: agora, ate: agora + v.parado } };
      return { ...a, posicao: { ...a.canto }, caminho: [], vida: { ...VIDA_INICIAL, contador: v.contador, ate: agora + esperaOciosa(a.codigo, v.contador) } };
    }
    case 'PARADO': {
      if (agora < v.ate) return a;
      const caminho = rota(a.posicao, a.canto);
      if (!caminho.length) return { ...a, vida: { ...VIDA_INICIAL, contador: v.contador, ate: agora + esperaOciosa(a.codigo, v.contador) } };
      return { ...a, caminho, vida: { ...v, acao: 'VOLTANDO', desde: agora } };
    }
  }
}

function semVida(a: Agente): Vida {
  return { ...VIDA_INICIAL, contador: a.vida.contador };
}

/** Termina o trabalho por fora (sessão do Claude Code ficou ociosa): mostra o balão um pouco e volta para o canto. */
export function liberar(a: Agente, balao: Balao, agora: number): Agente {
  return { ...a, fase: 'RESULTADO', desde: agora - (RESULTADO_MS - LIBERAR_MS), balao, pendente: null, vida: semVida(a) };
}

function chegar(a: Agente, agora: number): Agente {
  if (a.fase === 'INDO') {
    // Quem já tem um balão (atividade de uma sessão) mantém; as automações chegam e mostram "pensando…"
    return { ...a, posicao: { ...a.mesa }, caminho: [], fase: 'PENSANDO', desde: agora, balao: a.balao ?? BALAO_PENSANDO };
  }
  return { ...a, posicao: { ...a.canto }, caminho: [], fase: 'OCIOSO', desde: agora, balao: null, vida: semVida(a) };
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
