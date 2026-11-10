import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Logo (hexágono + "A" + nó do agente) e nome da marca — [[Identidade Visual]]. O texto continua "Agent Desk" (leitor de tela, testes); o caixa-alta é só CSS. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img class="simbolo" src="icons/marca.svg" alt="" aria-hidden="true" />
    <span class="nome"><span class="a">Agent</span> <span class="d">Desk</span></span>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 0.5em; font-size: var(--logo-tamanho, 1rem); line-height: 1; }
    .simbolo { height: 1.9em; width: auto; flex: none; filter: drop-shadow(var(--ui-brilho)); }
    .nome { font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; }
    .a { color: var(--ui-texto); }
    .d { background: var(--ui-degrade); -webkit-background-clip: text; background-clip: text; color: transparent; }
    @media (forced-colors: active) { .d { background: none; color: CanvasText; } }
  `,
})
export class Logo {}
