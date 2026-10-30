import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';
import { formatarDolar, formatarDolarCompacto, formatarNumero } from '../../shared/util/formatos';
import { ConsumoDia } from './data-access/consumo.models';
import { alturaBarra, diaCurto, eixoRedondo } from './data-access/consumo.util';

const ALTURA = 220;
const MARGEM = { topo: 12, direita: 8, base: 26, esquerda: 64 };
const VAO = 2; // espaço da cor da superfície entre barras vizinhas

/**
 * Custo por dia em barras (SVG puro, uma série: sem legenda — o título nomeia). Desenha na largura real do contêiner
 * (o texto não encolhe no celular). Tooltip por barra no hover e no foco do teclado; "Ver como tabela" é a alternativa
 * acessível. Sem animação (respeita prefers-reduced-motion por não ter nenhuma).
 */
@Component({
  selector: 'app-grafico-dias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topo">
      <h3 [id]="idTitulo">{{ titulo() }}</h3>
      <button type="button" class="ui-botao ui-botao--fantasma" [attr.aria-expanded]="comoTabela()" (click)="comoTabela.set(!comoTabela())">
        {{ comoTabela() ? 'Ver como gráfico' : 'Ver como tabela' }}
      </button>
    </div>

    @if (comoTabela()) {
      <div class="rolagem">
        <table [attr.aria-labelledby]="idTitulo">
          <thead><tr><th scope="col">Dia</th><th scope="col">Chamadas</th><th scope="col">Tokens</th><th scope="col">Custo</th></tr></thead>
          <tbody>
            @for (d of dias(); track d.dia) {
              <tr><td>{{ curto(d.dia) }}</td><td>{{ d.chamadas }}</td><td>{{ numero(d.tokens) }}</td><td>{{ dolar(d.custoUsd) }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="area">
        <svg [attr.width]="largura()" [attr.height]="altura" role="group" [attr.aria-labelledby]="idTitulo" (mouseleave)="ativo.set(null)">
          @for (m of layout().marcas; track m.valor) {
            <line class="grade" [attr.x1]="margem.esquerda" [attr.x2]="largura() - margem.direita" [attr.y1]="m.y" [attr.y2]="m.y" />
            <text class="rotulo" [attr.x]="margem.esquerda - 8" [attr.y]="m.y" text-anchor="end" dominant-baseline="middle">{{ m.texto }}</text>
          }
          @for (b of layout().barras; track b.dia; let i = $index) {
            <g class="coluna" tabindex="0" role="img" [attr.aria-label]="b.descricao"
               (mouseenter)="ativo.set(i)" (focus)="ativo.set(i)" (blur)="ativo.set(null)">
              <rect class="alvo" [attr.x]="b.x - vao / 2" [attr.y]="margem.topo" [attr.width]="b.largura + vao" [attr.height]="layout().alturaUtil" />
              @if (b.altura > 0) {
                <path class="barra" [class.ativa]="ativo() === i" [attr.d]="b.caminho" />
              }
              @if (b.rotulo) {
                <text class="rotulo" [attr.x]="b.x + b.largura / 2" [attr.y]="altura - 8" text-anchor="middle">{{ b.rotulo }}</text>
              }
            </g>
          }
          <line class="base" [attr.x1]="margem.esquerda" [attr.x2]="largura() - margem.direita" [attr.y1]="layout().base" [attr.y2]="layout().base" />
        </svg>
        @if (dica(); as t) {
          <div class="dica" role="status" [style.left.px]="t.x" [style.top.px]="t.y">
            <strong>{{ t.dia }}</strong>
            <span>{{ t.custo }}</span>
            <span class="suave">{{ t.chamadas }} · {{ t.tokens }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .topo { display: flex; justify-content: space-between; align-items: center; gap: var(--ui-e2); margin-bottom: var(--ui-e2); }
    h3 { font-size: var(--ui-t-md); }
    .area { position: relative; }
    svg { display: block; overflow: visible; }
    .grade { stroke: var(--ui-grafico-grade); stroke-width: 1; }
    .base { stroke: var(--ui-linha); stroke-width: 1; }
    .rotulo { fill: var(--ui-texto-3); font-size: 12px; font-variant-numeric: tabular-nums; }
    .alvo { fill: transparent; }
    .barra { fill: var(--ui-grafico); }
    .barra.ativa { fill: color-mix(in srgb, var(--ui-grafico) 75%, var(--ui-texto)); }
    .coluna { outline: none; cursor: default; }
    .coluna:focus-visible .alvo { fill: color-mix(in srgb, var(--ui-grafico) 12%, transparent); }
    .dica { position: absolute; transform: translate(-50%, calc(-100% - 8px)); pointer-events: none; z-index: 2;
      display: grid; gap: 2px; padding: var(--ui-e2) var(--ui-e3); min-width: 9rem; text-align: left;
      border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle); background: var(--ui-superficie);
      box-shadow: 0 4px 16px var(--ui-sombra); font-size: var(--ui-t-xs); color: var(--ui-texto); }
    .dica .suave { color: var(--ui-texto-2); }
    .rolagem { overflow-x: auto; max-height: 20rem; }
    table { width: 100%; border-collapse: collapse; font-size: var(--ui-t-sm); font-variant-numeric: tabular-nums; }
    th, td { padding: var(--ui-e1) var(--ui-e2); border-bottom: 1px solid var(--ui-linha); text-align: right; }
    th:first-child, td:first-child { text-align: left; }
  `,
})
export class GraficoDias {
  readonly dias = input.required<ConsumoDia[]>();
  readonly titulo = input('Custo por dia (US$)');

  protected readonly altura = ALTURA;
  protected readonly margem = MARGEM;
  protected readonly vao = VAO;
  protected readonly idTitulo = `grafico-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly comoTabela = signal(false);
  protected readonly ativo = signal<number | null>(null);
  protected readonly largura = signal(640);

  protected readonly curto = diaCurto;
  protected readonly numero = formatarNumero;
  protected readonly dolar = formatarDolarCompacto;

  protected readonly layout = computed(() => {
    const dias = this.dias();
    const largura = this.largura();
    const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
    const base = MARGEM.topo + alturaUtil;
    const { teto, passos } = eixoRedondo(Math.max(0, ...dias.map((d) => d.custoUsd)));
    const coluna = (largura - MARGEM.esquerda - MARGEM.direita) / Math.max(1, dias.length);
    const larguraBarra = Math.max(1, coluna - VAO);
    // ~6 rótulos no eixo X, sempre com o último dia (hoje)
    const cada = Math.max(1, Math.ceil(dias.length / Math.max(2, Math.floor(largura / 90))));

    const barras = dias.map((d, i) => {
      const x = MARGEM.esquerda + i * coluna + VAO / 2;
      const altura = alturaBarra(d.custoUsd, teto, alturaUtil);
      const mostrarRotulo = i === dias.length - 1 || (dias.length - 1 - i) % cada === 0;
      return {
        dia: d.dia,
        x,
        largura: larguraBarra,
        altura,
        caminho: barraArredondada(x, base, larguraBarra, altura),
        rotulo: mostrarRotulo ? diaCurto(d.dia) : '',
        descricao: `${diaCurto(d.dia)}: ${formatarDolarCompacto(d.custoUsd)}, ${d.chamadas} chamada(s), ${formatarNumero(d.tokens)} tokens`,
      };
    });
    const marcas = passos.map((valor) => ({
      valor,
      y: base - (valor / teto) * alturaUtil,
      texto: formatarDolar(valor, valor > 0 && valor < 0.01 ? 4 : 2),
    }));
    return { barras, marcas, alturaUtil, base };
  });

  protected readonly dica = computed(() => {
    const i = this.ativo();
    if (i === null) return null;
    const d = this.dias()[i];
    const b = this.layout().barras[i];
    if (!d || !b) return null;
    const meio = Math.min(Math.max(b.x + b.largura / 2, 80), this.largura() - 80);
    return {
      x: meio,
      y: this.layout().base - b.altura,
      dia: diaCurto(d.dia),
      custo: formatarDolarCompacto(d.custoUsd),
      chamadas: `${d.chamadas} chamada${d.chamadas === 1 ? '' : 's'}`,
      tokens: `${formatarNumero(d.tokens)} tokens`,
    };
  });

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    if (typeof ResizeObserver === 'undefined') return; // ambiente sem layout (testes)
    const observador = new ResizeObserver(([e]) => this.largura.set(Math.max(280, Math.floor(e.contentRect.width))));
    observador.observe(host);
    inject(DestroyRef).onDestroy(() => observador.disconnect());
  }
}

/** Barra com os cantos de cima arredondados (4px) e a base reta, apoiada no eixo. */
function barraArredondada(x: number, base: number, largura: number, altura: number): string {
  if (altura <= 0) return '';
  const r = Math.min(4, largura / 2, altura);
  const topo = base - altura;
  return `M${x},${base} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + largura - r} Q${x + largura},${topo} ${x + largura},${topo + r} V${base} Z`;
}
