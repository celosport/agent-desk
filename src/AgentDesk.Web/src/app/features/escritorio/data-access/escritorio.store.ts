import { Injectable, computed, inject, signal } from '@angular/core';
import { codigoDeErro, mensagemDeErro } from '../../../core/http/problema';
import { formatarDolarCompacto, formatarNumero } from '../../../shared/util/formatos';
import { Agente, Balao, avancar, concluirTarefa, descreverFase, iniciarTarefa, novoAgente, ocupado } from '../motor/agente';
import { FonteCena } from '../motor/fonte-cena';
import { MAXIMO_AGENTES, Personagem, lugarDe } from '../motor/personagens';
import { EquipeStore } from './equipe.store';
import { EscritorioApi } from './escritorio.api';
import { AutomacaoAgente, ExecucaoResumo } from './escritorio.models';

/** Falta de chave/modelo ou limite: a página oferece o link para Configurações. */
const CODIGOS_DE_CONFIGURACAO = new Set([
  'Automacoes.ChaveNaoConfigurada',
  'Automacoes.ModeloNaoDefinido',
  'Automacoes.LimiteMensalAtingido',
  'Anthropic.ChaveInvalida',
]);

export interface StatusAgente {
  codigo: string;
  apelido: string;
  automacao: string;
  descricao: string;
  status: string;
  ocupado: boolean;
}

/**
 * Estado do Escritório. Os agentes do motor ficam num array comum (o desenho lê a cada quadro, sem custo de signal);
 * `versao` só muda quando a fase ou o balão de alguém muda — é isso que a parte em HTML (balões, lista, aria-live) escuta.
 */
@Injectable()
export class EscritorioStore implements FonteCena {
  private readonly api = inject(EscritorioApi);
  private readonly equipe = inject(EquipeStore);

  /** Relógio da animação (ms). Trocável nos testes. */
  agora: () => number = () => performance.now();
  /** Movimento reduzido (prefers-reduced-motion), ligado pela página. */
  reduzido = false;

  readonly automacoes = signal<AutomacaoAgente[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly selecionado = signal<string | null>(null);
  readonly falha = signal<{ codigo: string; mensagem: string; irParaConfiguracoes: boolean } | null>(null);
  readonly ultimaExecucao = signal<ExecucaoResumo | null>(null);
  readonly versao = signal(0);
  /** Última mudança de um agente, para a região aria-live ("Sumi: pensando…"). */
  readonly anuncio = signal('');

  agentes: Agente[] = [];

  readonly status = computed<StatusAgente[]>(() => {
    this.versao();
    this.equipe.agentes(); // renomear um agente na Equipe atualiza a lista na hora
    return this.agentes.map((a) => {
      const automacao = this.automacoes().find((x) => x.codigo === a.codigo);
      return {
        codigo: a.codigo,
        apelido: this.visualDe(a.codigo).apelido,
        automacao: automacao?.nome ?? a.codigo,
        descricao: automacao?.descricao ?? '',
        status: descreverFase(a),
        ocupado: ocupado(a),
      };
    });
  });

  /** Descrição da sala para leitores de tela. */
  readonly descricao = computed(
    () => `Escritório em pixel art com ${this.status().length} agentes: ` + this.status().map((s) => `${s.apelido} (${s.automacao}), ${s.status}`).join('; '),
  );

  readonly selecionadoStatus = computed(() => this.status().find((s) => s.codigo === this.selecionado()) ?? null);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const lista = (await this.api.automacoes()).slice(0, MAXIMO_AGENTES);
      this.automacoes.set(lista);
      this.agentes = lista.map((a, i) => {
        const { mesa, canto } = lugarDe(i);
        return this.agentes.find((x) => x.codigo === a.codigo) ?? novoAgente(a.codigo, canto, mesa);
      });
      if (!this.selecionado()) this.selecionado.set(lista[0]?.codigo ?? null);
      this.versao.update((v) => v + 1);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  selecionar(codigo: string): void {
    this.selecionado.set(codigo);
  }

  visualDe(codigo: string): Personagem {
    return this.equipe.visualAutomacao(codigo);
  }

  /** Um quadro da animação. */
  passo(dtMs: number): void {
    const agora = this.agora();
    let mudou = false;
    this.agentes = this.agentes.map((a) => {
      const novo = avancar(a, agora, dtMs, this.reduzido);
      if (novo.fase !== a.fase || novo.balao !== a.balao) {
        mudou = true;
        this.anunciar(novo);
      }
      return novo;
    });
    if (mudou) this.versao.update((v) => v + 1);
  }

  /** Dispara a automação do agente: ele vai para a mesa e o balão mostra o resultado quando a API responder. */
  async executar(codigo: string, entrada: string): Promise<boolean> {
    const automacao = this.automacoes().find((a) => a.codigo === codigo);
    const agente = this.agentes.find((a) => a.codigo === codigo);
    if (!automacao || !agente || ocupado(agente)) return false;

    this.falha.set(null);
    this.trocar(codigo, (a) => iniciarTarefa(a, this.agora(), this.reduzido));
    let balao: Balao;
    try {
      const execucao = await this.api.executar(automacao.automacaoId, entrada);
      this.ultimaExecucao.set(execucao);
      balao = { tipo: 'resultado', texto: textoDoResultado(execucao) };
    } catch (e) {
      const codigoErro = codigoDeErro(e);
      const mensagem = mensagemDeErro(e);
      this.falha.set({ codigo, mensagem, irParaConfiguracoes: !!codigoErro && CODIGOS_DE_CONFIGURACAO.has(codigoErro) });
      balao = { tipo: 'erro', texto: resumir(mensagem) };
    }
    this.trocar(codigo, (a) => concluirTarefa(a, balao, this.agora()));
    return balao.tipo === 'resultado';
  }

  private trocar(codigo: string, f: (a: Agente) => Agente): void {
    this.agentes = this.agentes.map((a) => {
      if (a.codigo !== codigo) return a;
      const novo = f(a);
      if (novo.fase !== a.fase || novo.balao !== a.balao) this.anunciar(novo);
      return novo;
    });
    this.versao.update((v) => v + 1);
  }

  private anunciar(a: Agente): void {
    this.anuncio.set(`${this.visualDe(a.codigo).apelido}: ${descreverFase(a)}`);
  }
}

/** "1.800 tokens · US$ 0,0145" (+ aviso de limite ou de resposta cortada). */
export function textoDoResultado(e: ExecucaoResumo): string {
  let texto = `${formatarNumero(e.tokens.total)} tokens · ${formatarDolarCompacto(e.custoUsd)}`;
  if (e.alertaLimite) texto += e.alertaLimite.atingido ? ' · limite atingido' : ` · ${e.alertaLimite.percentual}% do limite`;
  if (e.truncado) texto += ' · cortada';
  return texto;
}

function resumir(texto: string): string {
  return texto.length <= 70 ? texto : `${texto.slice(0, 69)}…`;
}
