import { Signal } from '@angular/core';
import { Agente } from './agente';
import { Personagem } from './personagens';

/**
 * O que a cena precisa para desenhar uma sala: os agentes (lidos a cada quadro), a `versao` (muda só quando muda fase ou balão —
 * é o que o HTML escuta), quem está selecionado e o passo do motor. Implementado pela store das automações e pela das sessões.
 */
export interface FonteCena {
  readonly agentes: Agente[];
  readonly versao: Signal<number>;
  readonly selecionado: Signal<string | null>;
  reduzido: boolean;
  passo(dtMs: number): void;
  selecionar(codigo: string): void;
  /** Nome e aparência do robô (a personalização do usuário, ou o visual automático). */
  visualDe(codigo: string): Personagem;
}
