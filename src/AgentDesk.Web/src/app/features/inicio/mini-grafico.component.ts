import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatarDolarCompacto } from '../../shared/util/formatos';
import { diaCurto } from './data-access/inicio.util';

export interface PontoDia {
  dia: string;
  valor: number;
}

const L = 280;
const A = 90;
const BASE = 4;

/** Barras pequenas de custo por dia (uma série, SVG puro): o título nomeia; cada barra tem tooltip nativo e o resumo vai no aria-label. */
@Component({
  selector: 'app-mini-grafico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + largura + ' ' + altura" role="img" [attr.aria-label]="resumo()" preserveAspectRatio="none">
      <line x1="0" [attr.x2]="largura" [attr.y1]="altura - base" [attr.y2]="altura - base" class="eixo" />
      @for (b of barras(); track b.dia) {
        <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="2" class="barra"><title>{{ b.dica }}</title></rect>
      }
    </svg>
    <div class="datas" aria-hidden="true"><span>{{ primeiro() }}</span><span>{{ ultimo() }}</span></div>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: 96px; display: block; }
    .eixo { stroke: var(--ui-linha); stroke-width: 1; }
    .barra { fill: var(--ui-grafico); }
    .datas { display: flex; justify-content: space-between; font-size: var(--ui-t-xs); color: var(--ui-texto-2); }
  `,
})
export class MiniGrafico {
  readonly pontos = input.required<PontoDia[]>();
  /** Prefixo do valor, por exemplo "≈ " para o custo equivalente do Claude Code. */
  readonly prefixo = input('');

  protected readonly largura = L;
  protected readonly altura = A;
  protected readonly base = BASE;
  protected readonly primeiro = computed(() => (this.pontos().length ? diaCurto(this.pontos()[0].dia) : ''));
  protected readonly ultimo = computed(() => (this.pontos().length ? diaCurto(this.pontos()[this.pontos().length - 1].dia) : ''));

  protected readonly barras = computed(() => {
    const p = this.pontos();
    const maior = Math.max(0, ...p.map((x) => x.valor));
    const passo = p.length ? L / p.length : L;
    return p.map((x, i) => {
      const h = maior > 0 && x.valor > 0 ? Math.max(2, (x.valor / maior) * (A - BASE - 4)) : 0;
      return {
        dia: x.dia,
        x: i * passo + 1,
        w: Math.max(2, passo - 2),
        h,
        y: A - BASE - h,
        dica: `${diaCurto(x.dia)}: ${this.prefixo()}${formatarDolarCompacto(x.valor)}`,
      };
    });
  });

  protected readonly resumo = computed(() => {
    const p = this.pontos();
    const total = p.reduce((s, x) => s + x.valor, 0);
    const maior = p.reduce((m, x) => (x.valor > m.valor ? x : m), { dia: '', valor: 0 });
    if (!p.length) return 'Sem dados no período';
    const base = `Custo por dia, últimos ${p.length} dias: total ${this.prefixo()}${formatarDolarCompacto(total)}`;
    return maior.valor > 0 ? `${base}; maior dia ${diaCurto(maior.dia)} com ${this.prefixo()}${formatarDolarCompacto(maior.valor)}` : `${base}; sem uso no período`;
  });
}
