import { DestroyRef } from '@angular/core';

export interface OpcoesAtualizacao {
  /** Intervalo normal entre uma consulta e a próxima. */
  intervaloMs: number;
  /** Teto do intervalo quando a rede falha (dobra a cada falha seguida). */
  maximoMs?: number;
  /** Documento de onde ler a visibilidade (injetável nos testes). */
  documento?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
}

/**
 * "Quase tempo real" por consulta periódica — funciona com várias instâncias do servidor e sem conexão aberta
 * (WebSocket/SSE exigiriam um barramento entre instâncias). Use antes de pensar em WebSocket.
 *
 *  • roda `consultar` na hora e depois a cada `intervaloMs`, sem sobrepor consultas;
 *  • pausa com a aba em segundo plano e, ao voltar, consulta de imediato;
 *  • se `consultar` falhar, espera o dobro (até `maximoMs`) e volta ao normal no primeiro sucesso.
 *
 * Devolve a função que para tudo (também chamada sozinha quando o `DestroyRef` é destruído).
 */
export function atualizarPeriodicamente(
  consultar: () => Promise<void>,
  opcoes: OpcoesAtualizacao,
  destroyRef?: DestroyRef,
): () => void {
  const { intervaloMs, maximoMs = 60_000 } = opcoes;
  const doc = opcoes.documento ?? document;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let parado = false;
  let consultando = false;
  let espera = intervaloMs;

  const agendar = (ms: number) => {
    clearTimeout(temporizador);
    if (!parado) temporizador = setTimeout(ciclo, ms);
  };

  const ciclo = async () => {
    if (parado || consultando) return;
    if (doc.hidden) return; // volta pelo evento de visibilidade
    consultando = true;
    try {
      await consultar();
      espera = intervaloMs;
    } catch {
      espera = Math.min(maximoMs, espera * 2);
    } finally {
      consultando = false;
      agendar(espera);
    }
  };

  const aoMudarVisibilidade = () => {
    if (!doc.hidden) {
      espera = intervaloMs;
      clearTimeout(temporizador);
      void ciclo();
    }
  };

  doc.addEventListener('visibilitychange', aoMudarVisibilidade);
  void ciclo();

  const parar = () => {
    parado = true;
    clearTimeout(temporizador);
    doc.removeEventListener('visibilitychange', aoMudarVisibilidade);
  };
  destroyRef?.onDestroy(parar);
  return parar;
}
