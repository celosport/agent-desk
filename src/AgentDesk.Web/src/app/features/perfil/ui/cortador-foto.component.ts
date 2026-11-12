import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, output, signal, viewChild } from '@angular/core';
import {
  EstadoRecorte, ZOOM_MAXIMO, ZOOM_MINIMO, clamp, escalas, limitarDeslocamento, recorteInicial,
} from '../../../shared/util/recorte';

const QUADRO = 320; // px lógicos do quadro de edição
const SAIDA = 512; // lado da foto final

/**
 * Recortador da foto de perfil: o usuário arrasta, aproxima (zoom) e gira a imagem dentro de um quadro redondo.
 * Tudo no aparelho (canvas); entrega um JPEG quadrado de 512 px (o servidor só valida e guarda).
 */
@Component({
  selector: 'app-cortador-foto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cortador" role="group" aria-label="Ajustar foto">
      <canvas #tela class="tela" [width]="quadro" [height]="quadro" tabindex="0"
              aria-label="Área da foto. Arraste para mover; use as setas para ajustar e + e - para o zoom."
              (pointerdown)="comecar($event)" (pointermove)="mover($event)" (pointerup)="terminar($event)" (pointercancel)="terminar($event)"
              (keydown)="teclado($event)"></canvas>
      <div class="controles">
        <div class="ui-campo">
          <label for="zoom">Zoom</label>
          <input id="zoom" type="range" [min]="zoomMin" [max]="zoomMax" step="0.01" [value]="zoom()" (input)="mudarZoom($any($event.target).valueAsNumber)" />
        </div>
        <button type="button" class="ui-botao" (click)="girar()">Girar</button>
      </div>
      <div class="acoes">
        <button type="button" class="ui-botao ui-botao--primario" [disabled]="!pronto()" (click)="confirmar()">Usar esta foto</button>
        <button type="button" class="ui-botao" (click)="cancelado.emit()">Cancelar</button>
      </div>
      @if (erro()) {
        <p class="ui-erro" role="alert">{{ erro() }}</p>
      }
    </div>
  `,
  styles: `
    .cortador { display: grid; gap: var(--ui-e3); justify-items: center; }
    .tela {
      width: min(100%, 320px); aspect-ratio: 1; border-radius: 50%; cursor: grab; touch-action: none;
      background: var(--ui-superficie-2); outline-offset: 3px; box-shadow: 0 0 0 3px var(--ui-linha);
    }
    .tela:active { cursor: grabbing; }
    .controles { display: flex; gap: var(--ui-e3); align-items: end; width: min(100%, 320px); }
    .controles .ui-campo { flex: 1; }
    .acoes { display: flex; gap: var(--ui-e2); flex-wrap: wrap; justify-content: center; }
  `,
})
export class CortadorFoto implements OnDestroy {
  readonly arquivo = input.required<File>();
  readonly confirmado = output<{ blob: Blob; nome: string }>();
  readonly cancelado = output<void>();

  private readonly tela = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');

  protected readonly quadro = QUADRO;
  protected readonly zoomMin = ZOOM_MINIMO;
  protected readonly zoomMax = ZOOM_MAXIMO;
  protected readonly zoom = signal(1);
  protected readonly pronto = signal(false);
  protected readonly erro = signal<string | null>(null);

  private imagem: ImageBitmap | null = null;
  private estado: EstadoRecorte = recorteInicial(1, 1, QUADRO);
  private arrasto: { x: number; y: number } | null = null;

  constructor() {
    // Carrega a imagem sempre que o arquivo muda
    effect(() => {
      const arquivo = this.arquivo();
      void this.carregar(arquivo);
    });
  }

  ngOnDestroy(): void {
    this.imagem?.close();
  }

  private async carregar(arquivo: File): Promise<void> {
    this.pronto.set(false);
    this.erro.set(null);
    try {
      const nova = await createImageBitmap(arquivo);
      this.imagem?.close();
      this.imagem = nova;
      this.estado = recorteInicial(nova.width, nova.height, QUADRO);
      this.zoom.set(1);
      this.pronto.set(true);
      this.desenhar();
    } catch {
      this.erro.set('Não consegui ler essa imagem. Use uma foto PNG, JPEG ou WEBP.');
    }
  }

  protected comecar(e: PointerEvent): void {
    this.arrasto = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  protected mover(e: PointerEvent): void {
    if (!this.arrasto) return;
    const fator = QUADRO / this.tela().nativeElement.getBoundingClientRect().width; // px da tela → px do quadro
    this.deslocar((e.clientX - this.arrasto.x) * fator, (e.clientY - this.arrasto.y) * fator);
    this.arrasto = { x: e.clientX, y: e.clientY };
  }

  protected terminar(e: PointerEvent): void {
    this.arrasto = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  protected teclado(e: KeyboardEvent): void {
    const passo = 10;
    const movimentos: Record<string, [number, number]> = {
      ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo],
    };
    if (e.key in movimentos) {
      this.deslocar(...movimentos[e.key]);
    } else if (e.key === '+' || e.key === '=') {
      this.mudarZoom(this.zoom() + 0.1);
    } else if (e.key === '-') {
      this.mudarZoom(this.zoom() - 0.1);
    } else {
      return;
    }
    e.preventDefault();
  }

  protected mudarZoom(valor: number): void {
    this.zoom.set(clamp(valor, ZOOM_MINIMO, ZOOM_MAXIMO));
    this.estado = { ...this.estado, zoom: this.zoom() };
    this.reenquadrar();
  }

  protected girar(): void {
    this.estado = { ...this.estado, rotacao: (this.estado.rotacao + 1) % 4, deslocX: 0, deslocY: 0 };
    this.reenquadrar();
  }

  private deslocar(dx: number, dy: number): void {
    this.estado = { ...this.estado, deslocX: this.estado.deslocX + dx, deslocY: this.estado.deslocY + dy };
    this.reenquadrar();
  }

  /** Impede a imagem de sair do quadro (nunca aparece borda vazia) e redesenha. */
  private reenquadrar(): void {
    const { x, y } = limitarDeslocamento(this.estado);
    this.estado = { ...this.estado, deslocX: x, deslocY: y };
    this.desenhar();
  }

  private desenhar(): void {
    const canvas = this.tela().nativeElement;
    const ctx = canvas.getContext('2d');
    if (ctx && this.imagem) this.pintar(ctx, QUADRO);
  }

  /** Pinta o recorte atual em um quadro de `lado` px (a tela usa 320; a foto final, 512). */
  private pintar(ctx: CanvasRenderingContext2D, lado: number): void {
    const img = this.imagem!;
    const fator = lado / QUADRO;
    const { total } = escalas(this.estado);
    ctx.fillStyle = '#ffffff'; // PNG com transparência vira fundo branco no JPEG
    ctx.fillRect(0, 0, lado, lado);
    ctx.save();
    ctx.translate(lado / 2 + this.estado.deslocX * fator, lado / 2 + this.estado.deslocY * fator);
    ctx.rotate((this.estado.rotacao * Math.PI) / 2);
    ctx.scale(total * fator, total * fator);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  protected async confirmar(): Promise<void> {
    if (!this.imagem) return;
    const saida = document.createElement('canvas');
    saida.width = saida.height = SAIDA;
    const ctx = saida.getContext('2d');
    if (!ctx) return;
    this.pintar(ctx, SAIDA);
    const blob = await new Promise<Blob | null>((ok) => saida.toBlob(ok, 'image/jpeg', 0.9));
    if (!blob) {
      this.erro.set('Não foi possível preparar a foto.');
      return;
    }
    this.confirmado.emit({ blob, nome: 'foto.jpg' });
  }
}
