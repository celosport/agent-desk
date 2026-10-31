import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { Agente, avancar, novoAgente } from '../motor/agente';
import { FonteCena } from '../motor/fonte-cena';
import { MAXIMO_AGENTES, Personagem, lugarDe } from '../motor/personagens';
import { StatusSessao, sincronizarSessao } from '../motor/sessao';
import { EquipeStore } from './equipe.store';
import { SessoesApi } from './sessoes.api';
import { ProjetoAoVivo, SessaoAoVivo } from './sessoes.models';

/**
 * Sessões do Claude Code ao vivo. Cada projeto é uma sala; a sala escolhida mostra até 8 robôs (um por sessão), cada um com um
 * lugar fixo enquanto a sessão existir. O servidor manda o status (polling); o motor transforma em movimento.
 */
@Injectable()
export class SessoesStore implements FonteCena {
  private readonly api = inject(SessoesApi);
  private readonly equipe = inject(EquipeStore);

  /** Relógio da animação (ms). Trocável nos testes. */
  agora: () => number = () => performance.now();
  reduzido = false;

  readonly projetos = signal<ProjetoAoVivo[]>([]);
  readonly carregado = signal(false);
  readonly erro = signal<string | null>(null);
  readonly projetoSelecionado = signal<string | null>(null);
  readonly selecionado = signal<string | null>(null);
  readonly versao = signal(0);
  /** Para a região aria-live: o último robô que passou a precisar de você. */
  readonly anuncio = signal('');

  agentes: Agente[] = [];
  /** Lugar (0 a 7) de cada sessão na sala atual: não muda enquanto a sessão estiver lá. */
  private lugares = new Map<string, number>();
  private statusAnterior = new Map<string, StatusSessao>();

  readonly projeto = computed(() => this.projetos().find((p) => p.chave === this.projetoSelecionado()) ?? null);
  readonly sessoes = computed(() => this.projeto()?.sessoes ?? []);
  readonly foraDaSala = computed(() => Math.max(0, this.sessoes().length - MAXIMO_AGENTES));
  readonly esperandoVoce = computed(() => this.projetos().flatMap((p) => p.sessoes).filter((s) => s.status === 'ESPERANDO_VOCE').length);
  readonly descricao = computed(() => {
    this.versao();
    const p = this.projeto();
    if (!p) return 'Escritório do Claude Code, sem sessões';
    return `Sala ${p.nome} com ${p.sessoes.length} sessões: ` + p.sessoes.map((s) => `${this.apelido(s.sessaoId)}, ${s.atividade ?? s.status}`).join('; ');
  });

  apelido(sessaoId: string): string {
    return this.visualDe(sessaoId).apelido;
  }

  /** A equipe do projeto (se houver) vale pelo lugar do robô na sala; senão, o nome e a cor automáticos. */
  visualDe(sessaoId: string): Personagem {
    return this.equipe.visualSessao(this.projetoSelecionado(), this.lugares.get(sessaoId), sessaoId);
  }

  /** Uma consulta do polling. Lança o erro de volta (o polling espera mais e tenta de novo). */
  async atualizar(): Promise<void> {
    try {
      const aoVivo = await this.api.aoVivo();
      this.projetos.set(aoVivo.projetos);
      this.carregado.set(true);
      this.erro.set(null);
      if (!this.projeto()) {
        // Sem sala escolhida (ou a escolhida esvaziou): a que precisa de você primeiro, senão a mais recente
        const comAlerta = aoVivo.projetos.find((p) => p.sessoes.some((s) => s.status === 'ESPERANDO_VOCE'));
        this.trocarSala((comAlerta ?? aoVivo.projetos[0])?.chave ?? null);
      }
      this.sincronizar();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      throw e;
    }
  }

  escolherProjeto(chave: string): void {
    if (chave === this.projetoSelecionado()) return;
    this.trocarSala(chave);
    this.sincronizar();
  }

  selecionar(codigo: string): void {
    this.selecionado.set(codigo);
  }

  /** Um quadro da animação. */
  passo(dtMs: number): void {
    const agora = this.agora();
    let mudou = false;
    this.agentes = this.agentes.map((a) => {
      const novo = avancar(a, agora, dtMs, this.reduzido);
      if (novo.fase !== a.fase || novo.balao !== a.balao) mudou = true;
      return novo;
    });
    if (mudou) this.versao.update((v) => v + 1);
  }

  /** Aplica o status do servidor aos robôs da sala atual (entra quem chegou, sai quem foi embora). */
  private sincronizar(): void {
    const naSala = this.sessoes().slice(0, MAXIMO_AGENTES);
    const ids = new Set(naSala.map((s) => s.sessaoId));
    for (const id of [...this.lugares.keys()]) if (!ids.has(id)) this.lugares.delete(id);

    const agora = this.agora();
    const anteriores = new Map(this.agentes.map((a) => [a.codigo, a]));
    let mudou = this.agentes.length !== naSala.length;

    this.agentes = naSala.map((s) => {
      const anterior = anteriores.get(s.sessaoId) ?? this.novoRobo(s);
      const novo = sincronizarSessao(anterior, s.status, s.atividade, agora, this.reduzido);
      if (novo !== anterior || !anteriores.has(s.sessaoId)) mudou = true;
      this.avisarSePrecisaDeVoce(s);
      return novo;
    });
    if (mudou) this.versao.update((v) => v + 1);
  }

  private novoRobo(s: SessaoAoVivo): Agente {
    const usados = new Set(this.lugares.values());
    const livre = Array.from({ length: MAXIMO_AGENTES }, (_, i) => i).find((i) => !usados.has(i)) ?? 0;
    this.lugares.set(s.sessaoId, livre);
    const { mesa, canto } = lugarDe(livre);
    return novoAgente(s.sessaoId, canto, mesa);
  }

  private avisarSePrecisaDeVoce(s: SessaoAoVivo): void {
    const antes = this.statusAnterior.get(s.sessaoId);
    this.statusAnterior.set(s.sessaoId, s.status);
    if (s.status === 'ESPERANDO_VOCE' && antes !== 'ESPERANDO_VOCE') {
      this.anuncio.set(`${this.apelido(s.sessaoId)} (${this.projeto()?.nome ?? ''}): ${s.atividade ?? 'precisa de você'}`);
    }
  }

  private trocarSala(chave: string | null): void {
    this.projetoSelecionado.set(chave);
    this.agentes = [];
    this.lugares = new Map();
    this.selecionado.set(null);
  }
}
