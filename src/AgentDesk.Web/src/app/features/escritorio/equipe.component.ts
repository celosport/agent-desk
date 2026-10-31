import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { mensagemDeErro } from '../../core/http/problema';
import { AlvoAgente } from './data-access/equipe.models';
import { EquipeStore, paraPersonagem } from './data-access/equipe.store';
import { EscritorioApi } from './data-access/escritorio.api';
import { AutomacaoAgente } from './data-access/escritorio.models';
import { SessoesApi } from './data-access/sessoes.api';
import {
  ACESSORIOS,
  ANTENAS,
  EXPRESSOES,
  MAXIMO_AGENTES,
  PALETAS_PRONTAS,
  Personagem,
  paletaDeCores,
  personagemDe,
  personagemDeSessao,
} from './motor/personagens';
import { RoboPrevia } from './robo-previa.component';

const ROTULO_ACESSORIO: Record<(typeof ACESSORIOS)[number], string> = {
  NENHUM: 'Nenhum', BONE: 'Boné', CHAPEU: 'Chapéu', FONE: 'Fone', OCULOS: 'Óculos', GRAVATA: 'Gravata', LACO: 'Laço', COROA: 'Coroa',
};
const ROTULO_ANTENA: Record<(typeof ANTENAS)[number], string> = { RETA: 'Reta', BOLINHA: 'Bolinha', DUPLA: 'Dupla', NENHUMA: 'Sem antena' };
const ROTULO_EXPRESSAO: Record<(typeof EXPRESSOES)[number], string> = { NORMAL: 'Normal', FELIZ: 'Feliz', CONCENTRADO: 'Concentrado', SONOLENTO: 'Sonolento' };

/**
 * Tela "Equipe" do Escritório: dá nome e aparência (cores, acessório, antena, expressão) aos agentes das automações e monta a equipe
 * de cada projeto do Claude Code (até 8; a 1ª sessão a chegar na sala usa o agente 1, e assim por diante). Com pré-visualização ao vivo.
 * [[ADR-011 - Equipe Personalizada (Nome e Aparência dos Agentes)]]
 */
@Component({
  selector: 'app-equipe',
  imports: [ReactiveFormsModule, RoboPrevia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (carregando()) {
      <p class="ui-suave">Carregando…</p>
    } @else {
      <div class="layout">
        <section class="ui-cartao" aria-labelledby="titulo-quem">
          <h2 id="titulo-quem">Quem você quer personalizar?</h2>
          <div class="ui-campo">
            <label for="alvo">Tipo de agente</label>
            <select id="alvo" class="ui-entrada" [value]="alvo()" (change)="trocarAlvo($any($event.target).value)">
              <option value="AUTOMACAO">Agente de uma automação</option>
              <option value="PROJETO">Equipe de um projeto (Claude Code)</option>
            </select>
          </div>

          @if (alvo() === 'AUTOMACAO') {
            <div class="ui-campo">
              <label for="automacao">Automação</label>
              <select id="automacao" class="ui-entrada" [value]="automacaoSel()" (change)="escolherAutomacao($any($event.target).value)">
                @for (a of automacoes(); track a.codigo) {
                  <option [value]="a.codigo" [selected]="a.codigo === automacaoSel()">{{ nomeDe(a) }}</option>
                }
              </select>
            </div>
          } @else if (!projetos().length) {
            <p class="ui-suave">Nenhum projeto do Claude Code ainda. Quando uma sessão abrir num projeto, ele aparece aqui.</p>
          } @else {
            <div class="ui-campo">
              <label for="projeto">Projeto</label>
              <select id="projeto" class="ui-entrada" [value]="projetoSel()" (change)="escolherProjeto($any($event.target).value)">
                @for (p of projetos(); track p.chave) {
                  <option [value]="p.chave" [selected]="p.chave === projetoSel()">{{ p.nome }}</option>
                }
              </select>
            </div>
            <div class="ui-campo">
              <label for="posicao">Posição na equipe</label>
              <select id="posicao" class="ui-entrada" [value]="ordem()" (change)="escolherOrdem(+$any($event.target).value)">
                @for (i of posicoes; track i) {
                  <option [value]="i" [selected]="i === ordem()">{{ i + 1 }}º · {{ nomeDaPosicao(i) }}</option>
                }
              </select>
            </div>
            <p class="ui-suave dica">A 1ª sessão a chegar na sala do projeto usa o agente 1, a 2ª usa o 2, e assim por diante.</p>
          }
        </section>

        @if (podeEditar()) {
          <section class="ui-cartao" aria-labelledby="titulo-editor">
            <h2 id="titulo-editor">Aparência</h2>
            <div class="editor">
              <div class="previa">
                <app-robo-previa [visual]="visual()" />
                <strong>{{ visual().apelido || 'Sem nome' }}</strong>
              </div>

              <form [formGroup]="form" (ngSubmit)="salvar()" novalidate class="campos">
                <div class="ui-campo">
                  <label for="nome">Nome</label>
                  <input id="nome" class="ui-entrada" formControlName="nome" maxlength="20" autocomplete="off" />
                  @if (tentou() && !form.controls.nome.value.trim()) {
                    <p class="ui-erro" role="alert">Dê um nome ao agente.</p>
                  }
                </div>

                <div class="paletas" role="group" aria-label="Paletas prontas">
                  @for (p of paletas; track p.nome) {
                    <button type="button" class="paleta" [attr.aria-label]="p.nome" (click)="aplicarPaleta(p)">
                      <i [style.background]="p.cabeca"></i><i [style.background]="p.corpo"></i><i [style.background]="p.detalhe"></i>
                    </button>
                  }
                </div>

                <div class="cores">
                  <div class="ui-campo"><label for="c-cabeca">Cor da cabeça</label><input id="c-cabeca" type="color" formControlName="corCabeca" /></div>
                  <div class="ui-campo"><label for="c-corpo">Cor do corpo</label><input id="c-corpo" type="color" formControlName="corCorpo" /></div>
                  <div class="ui-campo"><label for="c-detalhe">Cor dos detalhes</label><input id="c-detalhe" type="color" formControlName="corDetalhe" /></div>
                  <div class="ui-campo"><label for="c-olhos">Cor dos olhos</label><input id="c-olhos" type="color" formControlName="corOlhos" /></div>
                </div>

                <div class="ui-campo">
                  <label for="acessorio">Acessório</label>
                  <select id="acessorio" class="ui-entrada" formControlName="acessorio">
                    @for (o of acessorios; track o) { <option [value]="o">{{ rotuloAcessorio[o] }}</option> }
                  </select>
                </div>
                <div class="ui-campo">
                  <label for="antena">Antena</label>
                  <select id="antena" class="ui-entrada" formControlName="antena">
                    @for (o of antenas; track o) { <option [value]="o">{{ rotuloAntena[o] }}</option> }
                  </select>
                </div>
                <div class="ui-campo">
                  <label for="expressao">Expressão</label>
                  <select id="expressao" class="ui-entrada" formControlName="expressao">
                    @for (o of expressoes; track o) { <option [value]="o">{{ rotuloExpressao[o] }}</option> }
                  </select>
                </div>

                <div class="acoes">
                  <button type="submit" class="ui-botao ui-botao--primario" [disabled]="salvando()">Salvar agente</button>
                  <button type="button" class="ui-botao" [disabled]="!personalizado() || salvando()" (click)="restaurar()">Restaurar padrão</button>
                </div>
                @if (mensagem(); as m) { <p class="ui-suave" role="status">{{ m }}</p> }
                @if (erro(); as e) { <p class="ui-erro" role="alert">{{ e }}</p> }
              </form>
            </div>
          </section>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .layout { display: grid; gap: var(--ui-e4); grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: start; }
    @media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    h2 { font-size: var(--ui-t-lg); }
    .ui-cartao { display: grid; gap: var(--ui-e3); align-content: start; }
    .dica { font-size: var(--ui-t-xs); }
    .editor { display: grid; gap: var(--ui-e4); grid-template-columns: auto minmax(0, 1fr); align-items: start; }
    @media (max-width: 640px) { .editor { grid-template-columns: minmax(0, 1fr); } }
    .previa { display: grid; gap: var(--ui-e2); justify-items: center; }
    .campos { display: grid; gap: var(--ui-e3); }
    .cores { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: var(--ui-e3); }
    .cores input[type='color'] { width: 100%; height: 2.5rem; padding: 2px; border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle); background: var(--ui-superficie); }
    .paletas { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
    .paleta { display: flex; padding: 3px; border: 1px solid var(--ui-linha); border-radius: var(--ui-raio-controle); background: var(--ui-superficie); cursor: pointer; }
    .paleta i { width: 14px; height: 22px; display: block; }
    .acoes { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
  `,
})
export class EquipeComponent {
  private readonly equipe = inject(EquipeStore);
  private readonly automacoesApi = inject(EscritorioApi);
  private readonly sessoesApi = inject(SessoesApi);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly acessorios = ACESSORIOS;
  protected readonly antenas = ANTENAS;
  protected readonly expressoes = EXPRESSOES;
  protected readonly rotuloAcessorio = ROTULO_ACESSORIO;
  protected readonly rotuloAntena = ROTULO_ANTENA;
  protected readonly rotuloExpressao = ROTULO_EXPRESSAO;
  protected readonly paletas = PALETAS_PRONTAS;
  protected readonly posicoes = Array.from({ length: MAXIMO_AGENTES }, (_, i) => i);

  protected readonly carregando = signal(true);
  protected readonly automacoes = signal<AutomacaoAgente[]>([]);
  private readonly projetosVivos = signal<{ chave: string; nome: string }[]>([]);
  protected readonly alvo = signal<AlvoAgente>('AUTOMACAO');
  protected readonly automacaoSel = signal('');
  protected readonly projetoSel = signal('');
  protected readonly ordem = signal(0);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);
  protected readonly mensagem = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = this.fb.group({
    nome: [''],
    corCabeca: ['#4c6ef5'],
    corCorpo: ['#364fc7'],
    corDetalhe: ['#ffd43b'],
    corOlhos: ['#74f0ff'],
    acessorio: ['NENHUM' as (typeof ACESSORIOS)[number]],
    antena: ['RETA' as (typeof ANTENAS)[number]],
    expressao: ['NORMAL' as (typeof EXPRESSOES)[number]],
  });
  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Projetos da lista: os vistos nas sessões e os que já têm equipe salva. */
  protected readonly projetos = computed(() => {
    const mapa = new Map(this.projetosVivos().map((p) => [p.chave, p.nome]));
    for (const a of this.equipe.agentes()) if (a.alvo === 'PROJETO' && !mapa.has(a.chave)) mapa.set(a.chave, a.chave);
    return [...mapa].map(([chave, nome]) => ({ chave, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  });

  private readonly chaveAtual = computed(() => (this.alvo() === 'AUTOMACAO' ? this.automacaoSel() : this.projetoSel()));
  private readonly ordemAtual = computed(() => (this.alvo() === 'AUTOMACAO' ? 0 : this.ordem()));
  protected readonly podeEditar = computed(() => !!this.chaveAtual());
  protected readonly personalizado = computed(() => !!this.equipe.obter(this.alvo(), this.chaveAtual(), this.ordemAtual()));

  protected readonly visual = computed<Personagem>(() => {
    const v = this.valores();
    return {
      apelido: (v.nome ?? '').trim(),
      paleta: paletaDeCores(v.corCabeca ?? '#000000', v.corCorpo ?? '#000000', v.corDetalhe ?? '#000000', v.corOlhos ?? '#000000'),
      acessorio: v.acessorio ?? 'NENHUM',
      antena: v.antena ?? 'RETA',
      expressao: v.expressao ?? 'NORMAL',
    };
  });

  constructor() {
    void this.iniciar();
  }

  // Os <option> usam [selected] (e não só [value] no <select>): as opções chegam depois do select e o navegador ignoraria o valor
  private async iniciar(): Promise<void> {
    await this.equipe.carregar();
    const [automacoes, aoVivo] = await Promise.all([
      this.automacoesApi.automacoes().catch(() => [] as AutomacaoAgente[]),
      this.sessoesApi.aoVivo().catch(() => null),
    ]);
    this.automacoes.set(automacoes);
    this.projetosVivos.set(aoVivo?.projetos.map((p) => ({ chave: p.chave, nome: p.nome })) ?? []);
    this.automacaoSel.set(automacoes[0]?.codigo ?? '');
    this.projetoSel.set(this.projetos()[0]?.chave ?? '');
    this.carregando.set(false);
    this.aplicarPedido();
    this.carregarForm();
  }

  /** Veio de "Personalizar" numa sala: já abre no agente certo (e limpa o pedido). */
  private aplicarPedido(): void {
    const pedido = this.equipe.pedido();
    if (!pedido) return;
    this.equipe.pedido.set(null);
    this.alvo.set(pedido.alvo);
    if (pedido.alvo === 'AUTOMACAO') this.automacaoSel.set(pedido.chave);
    else {
      this.projetoSel.set(pedido.chave);
      this.ordem.set(pedido.ordem);
    }
  }

  protected nomeDe(a: AutomacaoAgente): string {
    return `${this.equipe.visualAutomacao(a.codigo).apelido} · ${a.nome}`;
  }

  protected nomeDaPosicao(ordem: number): string {
    return this.equipe.obter('PROJETO', this.projetoSel(), ordem)?.nome ?? 'padrão';
  }

  protected trocarAlvo(alvo: AlvoAgente): void {
    this.alvo.set(alvo);
    this.carregarForm();
  }

  protected escolherAutomacao(codigo: string): void {
    this.automacaoSel.set(codigo);
    this.carregarForm();
  }

  protected escolherProjeto(chave: string): void {
    this.projetoSel.set(chave);
    this.carregarForm();
  }

  protected escolherOrdem(ordem: number): void {
    this.ordem.set(ordem);
    this.carregarForm();
  }

  protected aplicarPaleta(p: (typeof PALETAS_PRONTAS)[number]): void {
    this.form.patchValue({ corCabeca: p.cabeca, corCorpo: p.corpo, corDetalhe: p.detalhe, corOlhos: p.olhos });
  }

  /** Preenche o formulário com o que está salvo ou, se ainda não foi personalizado, com o visual atual do agente. */
  private carregarForm(): void {
    this.mensagem.set(null);
    this.erro.set(null);
    this.tentou.set(false);
    const alvo = this.alvo();
    const chave = this.chaveAtual();
    if (!chave) return;
    const salvo = this.equipe.obter(alvo, chave, this.ordemAtual());
    const v = salvo ? paraPersonagem(salvo) : alvo === 'AUTOMACAO' ? personagemDe(chave) : personagemDeSessao(`${chave}#${this.ordemAtual()}`);
    this.form.reset({
      nome: v.apelido,
      corCabeca: v.paleta.b,
      corCorpo: v.paleta.f,
      corDetalhe: v.paleta.a,
      corOlhos: v.paleta.d,
      acessorio: v.acessorio,
      antena: v.antena,
      expressao: v.expressao,
    });
  }

  protected async salvar(): Promise<void> {
    this.tentou.set(true);
    const f = this.form.getRawValue();
    const nome = f.nome.trim();
    if (!nome) return;
    this.salvando.set(true);
    this.mensagem.set(null);
    this.erro.set(null);
    try {
      await this.equipe.salvar({ alvo: this.alvo(), chave: this.chaveAtual(), ordem: this.ordemAtual(), ...f, nome });
      this.mensagem.set(`${nome} foi salvo.`);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async restaurar(): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await this.equipe.restaurar(this.alvo(), this.chaveAtual(), this.ordemAtual());
      this.carregarForm();
      this.mensagem.set('Agente restaurado para o padrão.');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
