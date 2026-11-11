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
import { Acompanhamento, acompanhar } from './motor/acompanhar';
import { escalaPara } from './motor/iso';
import { FOCOS, Foco, Regiao, regiaoDoFoco } from './motor/mapa';
import { acompanharMovimentoReduzido } from './movimento-reduzido';

/**
 * A sala em pixel art isométrica (Canvas 2D, escala inteira para ficar nítida). O desenho roda em requestAnimationFrame
 * (o navegador já pausa com a aba escondida) e para quando o componente sai da tela. Os balões são HTML por cima do canvas:
 * texto nítido em qualquer escala. O que acontece também é anunciado pela página (aria-live), então o canvas é decorativo
 * para leitores de tela, com uma descrição curta. Serve as duas salas: automações e sessões do Claude Code (via FonteCena).
 */
@Component({
  selector: 'app-cena-escritorio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.cheia]': 'cheia()', '(document:keydown.escape)': 'sairDaCheia()', '(window:resize)': 'recalcular()' },
  template: `
    <div class="focos" role="group" aria-label="Ambiente em foco">
      @for (f of focos; track f.foco) {
        <button type="button" [attr.aria-pressed]="foco() === f.foco" (click)="alterarFoco(f.foco)">{{ f.rotulo }}</button>
      }
    </div>
    <div class="palco" [style.width.px]="larguraCss()" [style.height.px]="alturaCss()">
      <canvas #tela role="img" [attr.aria-label]="descricao()" (click)="clicar($event)"></canvas>
      <button type="button" class="tela-cheia" (click)="alternarCheia()" [attr.aria-label]="cheia() ? 'Sair da tela cheia' : 'Abrir em tela cheia'"
              [title]="cheia() ? 'Sair da tela cheia (Esc)' : 'Abrir em tela cheia — ou clique fora dos robôs'">{{ cheia() ? '✕' : '⛶' }}</button>
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
    @if (acompanhamento().length) {
      <ul class="onde" aria-label="Quem está onde">
        @for (r of acompanhamento(); track r.codigo) {
          <li><span class="bolinha" [style.background]="r.cor"></span><strong>{{ r.nome }}</strong>
            <span class="local">📍 {{ r.onde }}</span> <span class="oque">· {{ r.oque }}</span></li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    /* Tela cheia: cobre a janela (e pede a Fullscreen API ao navegador, quando existe) */
    :host(.cheia) { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; background: var(--ui-fundo); }
    .palco { position: relative; margin: 0 auto; }
    .focos { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--ui-e1); margin-bottom: var(--ui-e2); }
    .focos button { min-height: 0; padding: 3px var(--ui-e3); border-radius: 999px; font: inherit; font-size: var(--ui-t-xs); cursor: pointer;
      border: 1px solid var(--ui-linha); background: transparent; color: var(--ui-texto-2); }
    .focos button[aria-pressed='true'] { background: var(--ui-superficie-2); color: var(--ui-texto); border-color: var(--ui-neon-1); box-shadow: var(--ui-brilho); }
    .onde { list-style: none; margin: var(--ui-e3) 0 0; padding: 0; display: grid; gap: 2px; font-size: var(--ui-t-xs); color: var(--ui-texto-2); }
    .onde li { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ui-e1); }
    .onde .bolinha { width: 0.6rem; height: 0.6rem; border-radius: 50%; align-self: center; flex: none; }
    .onde strong { color: var(--ui-texto); }
    .onde .local { color: var(--ui-marca-tinta); font-weight: 600; }
    :host(.cheia) .focos { position: fixed; top: 12px; left: 12px; z-index: 3; margin: 0; max-width: calc(100vw - 90px); justify-content: flex-start; }
    :host(.cheia) .onde { position: fixed; left: 12px; bottom: 10px; right: 12px; z-index: 3; margin: 0; padding: 6px 10px; border-radius: 10px;
      background: color-mix(in srgb, var(--ui-superficie) 88%, transparent); max-height: 28vh; overflow: auto; }
    .tela-cheia { position: absolute; top: 6px; right: 6px; z-index: 2; min-height: 0; width: 2rem; height: 2rem; padding: 0; border-radius: 8px;
      border: 1px solid var(--ui-linha); background: color-mix(in srgb, var(--ui-superficie) 85%, transparent); color: var(--ui-texto); cursor: pointer; font-size: 1rem; line-height: 1; }
    .tela-cheia:hover { border-color: var(--ui-neon-1); box-shadow: var(--ui-brilho); }
    :host(.cheia) .tela-cheia { position: fixed; top: 12px; right: 12px; }
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
  /** Tela cheia: a cena ocupa a janela inteira na maior escala inteira que couber. */
  protected readonly cheia = signal(false);
  protected readonly focos = FOCOS;
  /** Ambiente em foco: o andar todo ou uma aproximação (cozinha, banheiro…). */
  protected readonly foco = signal<Foco>('TUDO');
  private readonly regiao = computed<Regiao>(() => regiaoDoFoco(this.foco()));
  /** Quem está onde e fazendo o quê (atualiza ~3 vezes por segundo, só quando muda). */
  protected readonly acompanhamento = signal<(Acompanhamento & { nome: string; cor: string })[]>([]);
  /** Refaz o tamanho do canvas (definido quando o canvas existe). */
  protected recalcular: () => void = () => undefined;
  protected readonly larguraCss = computed(() => this.regiao().l * this.escala());
  protected readonly alturaCss = computed(() => this.regiao().a * this.escala());

  /** Balões só mudam quando muda a fase ou o balão de alguém (store.versao); ficam sobre a cabeça, na mesa. */
  protected readonly baloes = computed(() => {
    const fonte = this.fonte();
    fonte.versao();
    const escala = this.escala();
    const regiao = this.regiao();
    return fonte.agentes
      .filter((a) => a.balao && a.fase !== 'INDO' && a.fase !== 'VOLTANDO' && a.fase !== 'INDO_EMBORA' && a.fase !== 'CRACHA' && a.fase !== 'ELEVADOR' && a.fase !== 'AUSENTE')
      .map((a) => {
        const p = ancoraDoBalao(a);
        return { codigo: a.codigo, tipo: a.balao!.tipo, texto: a.balao!.texto, x: (p.x - regiao.x) * escala, y: (p.y - regiao.y) * escala };
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
        const reg = this.regiao();
        this.escala.set(this.cheia() ? Math.max(1, Math.floor(Math.min(window.innerWidth / reg.l, (window.innerHeight - 90) / reg.a))) : escalaPara(largura, reg.l));
        const dpr = window.devicePixelRatio || 1;
        const esc = this.escala() * dpr;
        canvas.width = reg.l * esc;
        canvas.height = reg.a * esc;
        ctx.setTransform(esc, 0, 0, esc, -reg.x * esc, -reg.y * esc);
        ctx.imageSmoothingEnabled = false;
      };
      medir();
      this.recalcular = medir;
      const aoMudarTelaCheia = () => {
        if (!document.fullscreenElement && this.cheia()) {
          this.cheia.set(false);
          medir();
        }
      };
      document.addEventListener('fullscreenchange', aoMudarTelaCheia);
      destroy.onDestroy(() => document.removeEventListener('fullscreenchange', aoMudarTelaCheia));
      const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
      observador?.observe(this.host.parentElement ?? this.host);

      let quadro = 0;
      let anterior = performance.now();
      let ultimoAcompanhamento = -1000;
      const desenhar = (agora: number) => {
        const dt = Math.min(100, agora - anterior); // aba que volta do segundo plano não "teleporta" o agente
        anterior = agora;
        const fonte = this.fonte();
        fonte.passo(dt);
        if (agora - ultimoAcompanhamento > 350) {
          ultimoAcompanhamento = agora;
          this.atualizarAcompanhamento(fonte);
        }
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
    const escala = caixa.width / this.regiao().l;
    const reg = this.regiao();
    const fonte = this.fonte();
    const agente = agenteEm(fonte.agentes, { x: (evento.clientX - caixa.left) / escala + reg.x, y: (evento.clientY - caixa.top) / escala + reg.y });
    if (agente) fonte.selecionar(agente.codigo);
    else if (!this.cheia()) this.alternarCheia(); // clicar na sala (fora dos robôs) abre em tela cheia
  }

  protected alterarFoco(foco: Foco): void {
    this.foco.set(foco);
    this.recalcular();
  }

  private atualizarAcompanhamento(fonte: FonteCena): void {
    const lista = fonte.agentes.map((a) => {
      const v = fonte.visualDe(a.codigo);
      return { ...acompanhar(a), nome: v.apelido, cor: v.paleta.b };
    });
    const antes = this.acompanhamento();
    if (lista.length === antes.length && lista.every((l, i) => l.onde === antes[i].onde && l.oque === antes[i].oque && l.nome === antes[i].nome)) return;
    this.acompanhamento.set(lista);
  }

  protected alternarCheia(): void {
    if (this.cheia()) {
      this.sairDaCheia();
      return;
    }
    this.cheia.set(true);
    this.recalcular();
    void this.host.requestFullscreen?.().catch(() => undefined); // sem a API (ou negada) fica a sobreposição da janela
  }

  protected sairDaCheia(): void {
    if (!this.cheia()) return;
    this.cheia.set(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.recalcular();
  }
}
