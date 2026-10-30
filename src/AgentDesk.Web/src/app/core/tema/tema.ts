import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

// Tema claro e escuro. "Automático" segue o aparelho. As cores ficam em styles.scss; aqui só se escolhe qual vale.

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';
export type Tema = 'claro' | 'escuro';

/** Mesma chave lida pelo script do index.html (aplica o tema antes de o app abrir, sem piscar). */
export const CHAVE_TEMA = 'agentdesk.tema';

/** Cor da barra do navegador (= --ui-fundo de cada tema). */
export const COR_BARRA: Record<Tema, string> = { claro: '#f6f7f9', escuro: '#14161b' };

export function lerPreferencia(valor: string | null | undefined): PreferenciaTema {
  return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
}

export function resolverTema(preferencia: PreferenciaTema, aparelhoEscuro: boolean): Tema {
  if (preferencia === 'sistema') return aparelhoEscuro ? 'escuro' : 'claro';
  return preferencia;
}

@Injectable({ providedIn: 'root' })
export class TemaApp {
  private readonly documento = inject(DOCUMENT);
  private readonly midia = this.documento.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  private readonly aparelhoEscuro = signal(this.midia?.matches ?? false);

  readonly preferencia = signal<PreferenciaTema>(lerPreferencia(ler(CHAVE_TEMA)));
  readonly tema = computed(() => resolverTema(this.preferencia(), this.aparelhoEscuro()));

  constructor() {
    this.midia?.addEventListener?.('change', (e) => this.aparelhoEscuro.set(e.matches));
    effect(() => this.aplicar(this.preferencia(), this.tema()));
  }

  escolher(preferencia: PreferenciaTema): void {
    this.preferencia.set(preferencia);
    try {
      if (preferencia === 'sistema') localStorage.removeItem(CHAVE_TEMA);
      else localStorage.setItem(CHAVE_TEMA, preferencia);
    } catch {
      /* navegação privada: vale só nesta visita */
    }
  }

  /** Alterna claro ↔ escuro a partir do tema que está na tela. */
  alternar(): void {
    this.escolher(this.tema() === 'escuro' ? 'claro' : 'escuro');
  }

  private aplicar(preferencia: PreferenciaTema, tema: Tema): void {
    const raiz = this.documento.documentElement;
    if (preferencia === 'sistema') delete raiz.dataset['tema'];
    else raiz.dataset['tema'] = preferencia;

    this.documento.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      const doEscuro = meta.getAttribute('media')?.includes('dark') ?? false;
      meta.setAttribute('content', preferencia === 'sistema' ? COR_BARRA[doEscuro ? 'escuro' : 'claro'] : COR_BARRA[tema]);
    });
  }
}

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
