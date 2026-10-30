// Liga uma sessão do Claude Code (status vindo do servidor a cada poucos segundos) aos movimentos de um robô (funções puras).
import { Agente, Balao, iniciarTarefa, liberar } from './agente';

/** = StatusSessao da API (SNAKE_CASE_UPPER). */
export type StatusSessao = 'TRABALHANDO' | 'ESPERANDO_VOCE' | 'OCIOSA' | 'ENCERRADA';

/** Trabalhando ou esperando você = na mesa. Ociosa ou encerrada = no canto. */
export function querMesa(status: StatusSessao): boolean {
  return status === 'TRABALHANDO' || status === 'ESPERANDO_VOCE';
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

  if (querMesa(status)) {
    let b = a;
    if (b.fase === 'OCIOSO' || b.fase === 'VOLTANDO' || b.fase === 'RESULTADO') b = iniciarTarefa(b, agora, reduzido);
    return mesmoBalao(b.balao, balao) ? b : { ...b, balao };
  }

  if (a.fase === 'INDO' || a.fase === 'PENSANDO') return liberar(a, balao, agora);
  return a;
}

function mesmoBalao(x: Balao | null, y: Balao): boolean {
  return !!x && x.tipo === y.tipo && x.texto === y.texto;
}
