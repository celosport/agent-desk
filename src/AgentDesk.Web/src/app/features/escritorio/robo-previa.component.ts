import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, viewChild } from '@angular/core';
import { desenharRobo } from './motor/desenho';
import { Personagem, SPRITE_A, SPRITE_L } from './motor/personagens';

const ESCALA = 8;

/** O robô em tamanho grande (parado, de frente) para o editor da Equipe: redesenha a cada mudança, sem animação. */
@Component({
  selector: 'app-robo-previa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #tela [width]="largura" [height]="altura" role="img" [attr.aria-label]="'Pré-visualização de ' + visual().apelido"></canvas>`,
  styles: `
    :host { display: block; }
    canvas { display: block; image-rendering: pixelated; width: 7rem; max-width: 100%; height: auto; border-radius: var(--ui-raio); }
  `,
})
export class RoboPrevia {
  readonly visual = input.required<Personagem>();

  protected readonly largura = SPRITE_L * ESCALA;
  protected readonly altura = SPRITE_A * ESCALA;
  private readonly tela = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');

  constructor() {
    afterRenderEffect(() => {
      const ctx = this.tela().nativeElement.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, this.largura, this.altura);
      desenharRobo(ctx, this.visual(), 'parado', 0, 0, ESCALA);
    });
  }
}
