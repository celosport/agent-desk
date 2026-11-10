import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { Agente, novoAgente } from './motor/agente';
import { PALETAS, adornosDoRobo, desenharRobo } from './motor/desenho';
import { poseDe } from './motor/pose';
import { Personagem, SPRITE_A, SPRITE_L } from './motor/personagens';
import { acompanharMovimentoReduzido } from './movimento-reduzido';

const ESCALA = 6;
const MARGEM_LADO = 24;
const MARGEM_TOPO = 40;
const MARGEM_BAIXO = 14;
const AUTO_MS = 2800;

type Modo = 'AUTO' | 'PARADO' | 'ANDANDO' | 'COSTAS' | 'DIGITANDO' | 'COMEMORANDO';
const MODOS: { modo: Modo; rotulo: string }[] = [
  { modo: 'AUTO', rotulo: 'Automático' },
  { modo: 'PARADO', rotulo: 'Parado' },
  { modo: 'ANDANDO', rotulo: 'Andando' },
  { modo: 'COSTAS', rotulo: 'De costas' },
  { modo: 'DIGITANDO', rotulo: 'Digitando' },
  { modo: 'COMEMORANDO', rotulo: 'Comemorando' },
];
const CICLO: Exclude<Modo, 'AUTO'>[] = ['PARADO', 'ANDANDO', 'COSTAS', 'DIGITANDO', 'COMEMORANDO'];

/** Um agente "de mentira" na fase que faz o motor produzir a pose desejada (a mesma do Escritório, sem Canvas da sala). */
function agenteDoModo(modo: Exclude<Modo, 'AUTO'>, agora: number): Agente {
  const base = novoAgente('previa', { x: 0, y: 0 }, { x: 0, y: 0 });
  switch (modo) {
    case 'ANDANDO':
      return { ...base, fase: 'VOLTANDO', desde: 0, caminho: [{ x: 1, y: 0 }] }; // desce para a direita, de frente
    case 'COSTAS':
      return { ...base, fase: 'INDO', desde: -1000, caminho: [{ x: 0, y: -1 }] }; // sobe para a mesa, de costas
    case 'DIGITANDO':
      return { ...base, fase: 'PENSANDO', desde: 0 };
    case 'COMEMORANDO':
      return { ...base, fase: 'RESULTADO', desde: Math.floor(agora / 2400) * 2400, balao: { tipo: 'resultado', texto: '' } };
    default:
      return base;
  }
}

/** O robô em tamanho grande para o editor da Equipe, ANIMADO com as mesmas poses do Escritório (andar, digitar, comemorar…). */
@Component({
  selector: 'app-robo-previa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #tela [width]="largura" [height]="altura" role="img" [attr.aria-label]="'Pré-visualização de ' + visual().apelido"></canvas>
    <div class="modos" role="group" aria-label="Animação da pré-visualização">
      @for (m of modos; track m.modo) {
        <button type="button" [attr.aria-pressed]="modo() === m.modo" (click)="modo.set(m.modo)">{{ m.rotulo }}</button>
      }
    </div>
  `,
  styles: `
    :host { display: grid; gap: var(--ui-e2); justify-items: center; }
    canvas { display: block; image-rendering: pixelated; width: 9rem; max-width: 100%; height: auto; border-radius: var(--ui-raio); background: var(--ui-superficie-2); }
    .modos { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--ui-e1); max-width: 12rem; }
    .modos button {
      min-height: 0; padding: 2px var(--ui-e2); border-radius: 999px; font: inherit; font-size: var(--ui-t-xs); cursor: pointer;
      border: 1px solid var(--ui-linha); background: transparent; color: var(--ui-texto-2);
    }
    .modos button[aria-pressed='true'] { background: var(--ui-superficie-2); color: var(--ui-texto); border-color: var(--ui-neon-1); box-shadow: var(--ui-brilho); }
  `,
})
export class RoboPrevia {
  readonly visual = input.required<Personagem>();

  protected readonly modos = MODOS;
  protected readonly modo = signal<Modo>('AUTO');
  protected readonly largura = SPRITE_L * ESCALA + 2 * MARGEM_LADO;
  protected readonly altura = SPRITE_A * ESCALA + MARGEM_TOPO + MARGEM_BAIXO;
  private readonly tela = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      let reduzido = false;
      acompanharMovimentoReduzido((r) => (reduzido = r), this.destroyRef);
      let quadro = 0;
      const desenhar = (agora: number) => {
        this.desenhar(agora, reduzido);
        quadro = requestAnimationFrame(desenhar);
      };
      quadro = requestAnimationFrame(desenhar);
      this.destroyRef.onDestroy(() => cancelAnimationFrame(quadro));
    });
  }

  private desenhar(agora: number, reduzido: boolean): void {
    const ctx = this.tela().nativeElement.getContext('2d');
    if (!ctx) return;
    const escolhido = this.modo();
    const modo = escolhido === 'AUTO' ? CICLO[Math.floor(agora / AUTO_MS) % CICLO.length] : escolhido;
    // o tempo de cada modo começa do zero quando ele é escolhido/entra no ciclo, para a pose não "pular" no meio
    const t = escolhido === 'AUTO' ? agora - Math.floor(agora / AUTO_MS) * AUTO_MS + 5000 : agora;
    const pose = poseDe(agenteDoModo(modo, t), t, reduzido);

    ctx.clearRect(0, 0, this.largura, this.altura);
    // sombra no chão: encolhe quando o robô sobe
    const largSombra = (SPRITE_L - 4 - Math.max(0, -pose.dy) * 2) * ESCALA;
    ctx.fillStyle = 'rgb(0 0 0 / 0.25)';
    ctx.beginPath();
    ctx.ellipse(this.largura / 2, this.altura - MARGEM_BAIXO + 2, largSombra / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    desenharRobo(
      ctx,
      this.visual(),
      pose.quadro,
      MARGEM_LADO + pose.dx * ESCALA,
      MARGEM_TOPO + pose.dy * ESCALA,
      ESCALA,
      pose.inclinar,
      pose.cara,
      pose.olhar,
      pose.bracosParaCima,
      reduzido ? 0 : Math.floor(agora / 120) % 4,
    );
    // efeitos do acessório/antena (notas, brilho, ondas…) no mesmo tamanho ampliado
    ctx.save();
    ctx.translate(MARGEM_LADO + pose.dx * ESCALA, MARGEM_TOPO + pose.dy * ESCALA);
    ctx.scale(ESCALA, ESCALA);
    adornosDoRobo(ctx, this.visual(), 0, 0, PALETAS.escuro, { agora, reduzido });
    ctx.restore();
  }
}
