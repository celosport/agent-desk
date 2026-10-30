import { Injectable, signal } from '@angular/core';

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'info' | 'sucesso' | 'erro';
}

/** Avisos curtos (toast), anunciados ao leitor de tela pela região aria-live do App. */
@Injectable({ providedIn: 'root' })
export class Avisos {
  private seq = 0;
  readonly lista = signal<Aviso[]>([]);

  mostrar(texto: string, tipo: Aviso['tipo'] = 'info', duracaoMs = 3500): void {
    const aviso = { id: ++this.seq, texto, tipo };
    this.lista.update((l) => [...l, aviso]);
    setTimeout(() => this.lista.update((l) => l.filter((a) => a.id !== aviso.id)), duracaoMs);
  }
}
