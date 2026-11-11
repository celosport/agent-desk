// Liga uma sessão do Claude Code (status vindo do servidor a cada poucos segundos) aos movimentos de um robô (funções puras).
import { Agente, Balao, iniciarTarefa, liberar, pausarParaCafe } from './agente';

/** = StatusSessao da API (SNAKE_CASE_UPPER). */
export type StatusSessao = 'TRABALHANDO' | 'ESPERANDO_VOCE' | 'OCIOSA' | 'ENCERRADA';

/** Trabalhando = na mesa. Esperando você = na cozinha, com um café. Ociosa ou encerrada = vai embora pelo elevador. */
export function querMesa(status: StatusSessao): boolean {
  return status === 'TRABALHANDO';
}

export function balaoDaSessao(status: StatusSessao, atividade: string | undefined): Balao {
  if (status === 'ESPERANDO_VOCE') return { tipo: 'alerta', texto: atividade || '✋ Precisa de você' };
  if (status === 'TRABALHANDO') return { tipo: 'atividade', texto: atividade || '💭 Pensando…' };
  return { tipo: 'resultado', texto: atividade || '✅ Terminou' };
}

/**
 * Aplica o status atual: quem passou a trabalhar vai (ou continua) na mesa com o balão da atividade; quem ficou ociosa mostra
 * o último balão por alguns segundos e volta para o canto. Devolve o mesmo objeto se nada mudou.
 */
export function sincronizarSessao(a: Agente, status: StatusSessao, atividade: string | undefined, agora: number, reduzido: boolean): Agente {
  const balao = balaoDaSessao(status, atividade);

  if (status === 'ESPERANDO_VOCE') {
    // Esperando uma aprovação: vai tomar um café (ou uma água) até você responder
    let b = a;
    if (reduzido) {
      if (b.fase !== 'INDO' && b.fase !== 'PENSANDO') b = iniciarTarefa(b, agora, reduzido); // sem andar: fica na mesa
    } else if (b.fase !== 'PAUSA' && b.fase !== 'PAUSA_INDO') {
      b = pausarParaCafe(b, agora, reduzido);
    }
    return mesmoBalao(b.balao, balao) ? b : { ...b, balao };
  }

  if (querMesa(status)) {
    let b = a;
    if (b.fase !== 'INDO' && b.fase !== 'PENSANDO') b = iniciarTarefa(b, agora, reduzido); // inclui voltar do elevador e da cozinha
    return mesmoBalao(b.balao, balao) ? b : { ...b, balao };
  }

  if (a.fase === 'INDO' || a.fase === 'PENSANDO' || a.fase === 'PAUSA' || a.fase === 'PAUSA_INDO') return liberar(a, balao, agora);
  return a;
}

function mesmoBalao(x: Balao | null, y: Balao): boolean {
  return !!x && x.tipo === y.tipo && x.texto === y.texto;
}
