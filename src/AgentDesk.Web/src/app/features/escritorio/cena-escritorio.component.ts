import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TemaApp } from '../../core/tema/tema';
import { PALETAS, agenteEm, ancoraDoBalao, desenharSala } from './motor/desenho';
import { FonteCena } from './motor/fonte-cena';
import { CENA_A, CENA_L, escalaPara } from './motor/iso';

/**
 * A sala em pixel art isométrica (Canvas 2D, escala inteira para ficar nítida). O desenho roda em requestAnimationFrame
 * (o navegador já pausa com a aba escondida) e para quando o componente sai da tela. Os balões são HTML por cima do canvas:
 * texto nítido em qualquer escala. O que acontece também é anunciado pela página (aria-live), então o canvas é decorativo
 * para leitores de tela, com uma descrição curta. Serve as duas salas: automações e sessões do Claude Code (via FonteCena).
 */
@Component({
  selector: 'app-cena-escritorio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="palco" [style.width.px]="larguraCss()" [style.height.px]="alturaCss()">
      <canvas #tela role="img" [attr.aria-label]="descricao()" (click)="clicar($event)"></canvas>
      @for (b of baloes(); track b.codigo) {
        <div [class]="'balao ' + b.tipo" [style.left.px]="b.x" [style.top.px]="b.y" aria-hidden="true"
             [attr.data-agente]="b.codigo">
          @if (b.tipo === 'pensando') {
            <span>pensando</span><span class="pontos"><i>.</i><i>.</i><i>.</i></span>
          } @else {
            {{ b.texto }}
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .palco { position: relative; margin: 0 auto; }
    canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; cursor: pointer; border-radius: var(--ui-raio); }
    .balao { position: absolute; transform: translate(-50%, -100%); max-width: 13rem; width: max-content;
      padding: 4px 8px; border-radius: 10px; border: 2px solid var(--ui-texto); background: var(--ui-superficie);
      color: var(--ui-texto); font-size: var(--ui-t-xs); font-weight: 700; line-height: 1.25; text-align: center;
      pointer-events: none; box-shadow: 0 2px 0 var(--ui-texto); }
    .balao::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 8px; height: 8px; transform: translateX(-50%) rotate(45deg);
      background: var(--ui-superficie); border-right: 2px solid var(--ui-texto); border-bottom: 2px solid var(--ui-texto); }
    .balao.resultado { border-color: var(--ui-verde); box-shadow: 0 2px 0 var(--ui-verde); }
    .balao.resultado::after { border-color: var(--ui-verde); }
    .balao.erro { border-color: var(--ui-vermelho); box-shadow: 0 2px 0 var(--ui-vermelho); }
    .balao.erro::after { border-color: var(--ui-vermelho); }
    .balao.atividade { font-weight: 600; }
    .balao.alerta { border-color: #f08c00; box-shadow: 0 2px 0 #f08c00; background: var(--ui-alerta-fundo); }
    .balao.alerta::after { border-color: #f08c00; }
    .pontos i { font-style: normal; animation: pulo 1.2s infinite; display: inline-block; }
    .pontos i:nth-child(2) { animation-delay: 0.2s; }
    .pontos i:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulo { 0%, 60%, 100% { transform: none; } 30% { transform: translateY(-3px); } }
    @media (prefers-reduced-motion: reduce) { .pontos i { animation: none; } }
  `,
})
export class CenaEscritorio {
  readonly fonte = input.required<FonteCena>();
  /** Descrição da cena para leitores de tela (quem está na sala e fazendo o quê). */
  readonly descricao = input('Escritório em pixel art');

  private readonly tema = inject(TemaApp);
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly tela = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');

  private readonly escala = signal(2);
  protected readonly larguraCss = computed(() => CENA_L * this.escala());
  protected readonly alturaCss = computed(() => CENA_A * this.escala());

  /** Balões só mudam quando muda a fase ou o balão de alguém (store.versao); ficam sobre a cabeça, na mesa. */
  protected readonly baloes = computed(() => {
    const fonte = this.fonte();
    fonte.versao();
    const escala = this.escala();
    return fonte.agentes
      .filter((a) => a.balao && a.fase !== 'INDO' && a.fase !== 'VOLTANDO')
      .map((a) => {
        const p = ancoraDoBalao(a);
        return { codigo: a.codigo, tipo: a.balao!.tipo, texto: a.balao!.texto, x: p.x * escala, y: p.y * escala };
      });
  });

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const canvas = this.tela().nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const medir = () => {
        const largura = this.host.parentElement?.clientWidth ?? this.host.clientWidth;
        this.escala.set(escalaPara(largura));
        const dpr = window.devicePixelRatio || 1;
        canvas.width = CENA_L * this.escala() * dpr;
        canvas.height = CENA_A * this.escala() * dpr;
        ctx.setTransform(this.escala() * dpr, 0, 0, this.escala() * dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
      };
      medir();
      const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
      observador?.observe(this.host.parentElement ?? this.host);

      let quadro = 0;
      let anterior = performance.now();
      const desenhar = (agora: number) => {
        const dt = Math.min(100, agora - anterior); // aba que volta do segundo plano não "teleporta" o agente
        anterior = agora;
        const fonte = this.fonte();
        fonte.passo(dt);
        desenharSala(ctx, fonte.agentes, PALETAS[this.tema.tema()], { agora, reduzido: fonte.reduzido }, fonte.selecionado(), (codigo) => fonte.visualDe(codigo));
        quadro = requestAnimationFrame(desenhar);
      };
      quadro = requestAnimationFrame(desenhar);

      destroy.onDestroy(() => {
        cancelAnimationFrame(quadro);
        observador?.disconnect();
      });
    });
  }

  /** Clique num robô seleciona a automação dele. */
  protected clicar(evento: MouseEvent): void {
    const caixa = this.tela().nativeElement.getBoundingClientRect();
    const escala = caixa.width / CENA_L;
    const fonte = this.fonte();
    const agente = agenteEm(fonte.agentes, { x: (evento.clientX - caixa.left) / escala, y: (evento.clientY - caixa.top) / escala });
    if (agente) fonte.selecionar(agente.codigo);
  }
}
