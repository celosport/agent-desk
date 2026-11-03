import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { Agente, avancar, novoAgente } from '../motor/agente';
import { FonteCena } from '../motor/fonte-cena';
import { MAXIMO_AGENTES, Personagem, PADRAO_AJUDANTE, lugarDe, paletaDe } from '../motor/personagens';
import { StatusSessao, sincronizarSessao } from '../motor/sessao';
import { EquipeStore } from './equipe.store';
import { Participante, Sala, montarSalas, participantesDaCena, projetosHomonimos } from './salas';
import { SessoesApi } from './sessoes.api';
import { PermissaoPendente, ProjetoAoVivo, SessaoAoVivo } from './sessoes.models';

/**
 * Sessões do Claude Code ao vivo. Cada projeto é uma sala (ou vários, se o usuário os juntou num grupo); a sala escolhida mostra
 * até 8 robôs — um por sessão e, nas mesas que sobrarem, um ajudante por subagente —, cada um com uma mesa fixa enquanto existir.
 * O servidor manda o status (polling); o motor transforma em movimento.
 */
@Injectable()
export class SessoesStore implements FonteCena {
  private readonly api = inject(SessoesApi);
  private readonly equipe = inject(EquipeStore);

  /** Relógio da animação (ms). Trocável nos testes. */
  agora: () => number = () => performance.now();
  reduzido = false;

  /** O que a API mandou (um item por projeto). */
  private readonly brutos = signal<ProjetoAoVivo[]>([]);
  readonly carregado = signal(false);
  readonly erro = signal<string | null>(null);
  readonly projetoSelecionado = signal<string | null>(null);
  readonly selecionado = signal<string | null>(null);
  readonly versao = signal(0);
  /** Erro de Parar/Aprovar/Negar/Agrupar (ex.: o pedido de permissão venceu): aparece junto dos botões. */
  readonly erroControle = signal<string | null>(null);
  /** Para a região aria-live: o último robô que passou a precisar de você. */
  readonly anuncio = signal('');

  agentes: Agente[] = [];
  /** Mesa (0 a 7) de cada robô na sala atual: não muda enquanto ele estiver lá. */
  private lugares = new Map<string, number>();
  private statusAnterior = new Map<string, StatusSessao>();
  /** Os ajudantes da cena atual (código → quem é): o nome do robô é o tipo do subagente. */
  private ajudantes = new Map<string, NonNullable<Participante['subagente']>>();

  /** As salas: projetos do mesmo grupo vêm juntos. */
  readonly projetos = computed<Sala[]>(() => montarSalas(this.brutos()));
  readonly projeto = computed(() => this.projetos().find((p) => p.chave === this.projetoSelecionado()) ?? null);
  readonly sessoes = computed(() => this.projeto()?.sessoes ?? []);
  /** Quem entra na cena e quantos não couberam (a lista ao lado mostra todos). */
  private readonly cena = computed(() => participantesDaCena(this.sessoes()));
  /** Pedidos de permissão esperando você, de TODAS as salas (é urgente: o Claude Code espera ~50 s). */
  readonly permissoes = computed(() =>
    this.projetos().flatMap((p) =>
      p.sessoes
        .filter((s): s is SessaoAoVivo & { permissaoPendente: PermissaoPendente } => !!s.permissaoPendente)
        .map((s) => ({ sessaoId: s.sessaoId, projeto: p.nome, permissao: s.permissaoPendente, noProjetoAtual: p.chave === this.projetoSelecionado() })),
    ),
  );
  readonly foraDaSala = computed(() => this.cena().fora);
  readonly esperandoVoce = computed(() => this.projetos().flatMap((p) => p.sessoes).filter((s) => s.status === 'ESPERANDO_VOCE').length);
  /** Subagentes trabalhando agora na sala atual. */
  readonly ajudantesAtivos = computed(() => this.sessoes().reduce((n, s) => n + (s.subagentes ?? []).filter((a) => a.status === 'TRABALHANDO').length, 0));
  /** Outras salas com o mesmo nome de pasta, fora de grupos: a tela oferece juntá-las. */
  readonly homonimas = computed(() => {
    const sala = this.projeto();
    return sala ? projetosHomonimos(this.projetos(), sala) : [];
  });
  /** Nomes dos grupos que já existem (para sugerir ao juntar outra sala). */
  readonly grupos = computed(() => [...new Set(this.brutos().flatMap((p) => (p.grupo ? [p.grupo] : [])))]);
  readonly descricao = computed(() => {
    this.versao();
    const p = this.projeto();
    if (!p) return 'Escritório do Claude Code, sem sessões';
    return (
      `Sala ${p.nome} com ${p.sessoes.length} sessões: ` +
      p.sessoes.map((s) => `${this.apelido(s.sessaoId)}, ${s.atividade ?? s.status}${this.textoAjudantes(s)}`).join('; ')
    );
  });

  private textoAjudantes(s: SessaoAoVivo): string {
    const ativos = (s.subagentes ?? []).filter((a) => a.status === 'TRABALHANDO');
    return ativos.length ? ` (ajudantes: ${ativos.map((a) => `${a.tipo}, ${a.atividade ?? 'trabalhando'}`).join('; ')})` : '';
  }

  apelido(codigo: string): string {
    return this.visualDe(codigo).apelido;
  }

  /**
   * Nome e aparência. Sessão: a Equipe do projeto DELA, no lugar fixo que o servidor deu a ela (não depende da ordem de chegada,
   * de qual sala está aberta nem de a sala estar num grupo). Subagente: o tipo dele como nome, com um visual próprio.
   */
  visualDe(codigo: string): Personagem {
    const ajudante = this.ajudantes.get(codigo);
    if (ajudante) return { ...PADRAO_AJUDANTE, apelido: ajudante.tipo, paleta: paletaDe(codigo) };
    const identidade = this.identidade(codigo);
    return this.equipe.visualSessao(identidade?.chave ?? null, identidade?.ordem, codigo);
  }

  /** (projeto, lugar) que liga a sessão ao agente da Equipe. Sessões antigas, sem lugar no servidor, usam a mesa em que estão. */
  private identidade(sessaoId: string): { chave: string; ordem: number } | null {
    const sessao = this.sessoes().find((s) => s.sessaoId === sessaoId);
    if (!sessao) return null;
    const ordem = sessao.lugar ?? this.lugares.get(sessaoId);
    const chave = sessao.projetoChave ?? this.projetoSelecionado();
    return chave !== null && ordem !== undefined ? { chave, ordem } : null;
  }

  /** Nome para mostrar: o da sala atual, ou o projeto (as outras salas não têm lugar definido). */
  nomeParaPedido(sessaoId: string, projeto: string, noProjetoAtual: boolean): string {
    return noProjetoAtual ? this.apelido(sessaoId) : `Sessão de ${projeto}`;
  }

  /** Pede para parar a sessão (vale na próxima ferramenta). */
  async parar(sessaoId: string): Promise<void> {
    this.erroControle.set(null);
    try {
      await this.api.parar(sessaoId);
      await this.atualizar().catch(() => undefined);
    } catch (e) {
      this.erroControle.set(mensagemDeErro(e));
    }
  }

  async decidir(permissaoId: string, decisao: 'APROVAR' | 'NEGAR'): Promise<void> {
    this.erroControle.set(null);
    try {
      await this.api.decidir(permissaoId, decisao);
    } catch (e) {
      this.erroControle.set(mensagemDeErro(e));
    }
    await this.atualizar().catch(() => undefined); // o pedido some da lista na hora (ou já tinha vencido)
  }

  /**
   * Junta o projeto a um grupo (ou tira, com `grupo` nulo). A sala atual acompanha: juntar vira a sala do grupo; tirar o único
   * projeto de um grupo volta para a sala do próprio projeto.
   */
  async agrupar(projetoChave: string, grupo: string | null): Promise<void> {
    this.erroControle.set(null);
    try {
      await this.api.definirGrupo(projetoChave, grupo);
    } catch (e) {
      this.erroControle.set(mensagemDeErro(e));
      return;
    }
    await this.atualizar().catch(() => undefined);
    const emUso = this.brutos().find((p) => p.chave === projetoChave);
    if (emUso) this.escolherProjeto(emUso.grupo ? `g:${emUso.grupo}` : emUso.chave);
  }

  /** O agente da equipe do projeto que esta sessão representa; null se a sessão não está na sala (ou é um ajudante). */
  agenteDaSessao(sessaoId: string): { alvo: 'PROJETO'; chave: string; ordem: number } | null {
    const identidade = this.identidade(sessaoId);
    return identidade ? { alvo: 'PROJETO', chave: identidade.chave, ordem: identidade.ordem } : null;
  }

  /** Uma consulta do polling. Lança o erro de volta (o polling espera mais e tenta de novo). */
  async atualizar(): Promise<void> {
    try {
      const aoVivo = await this.api.aoVivo();
      this.brutos.set(aoVivo.projetos);
      this.carregado.set(true);
      this.erro.set(null);
      if (!this.projeto()) {
        // Sem sala escolhida (ou a escolhida esvaziou): a que precisa de você primeiro, senão a mais recente
        const salas = this.projetos();
        const comAlerta = salas.find((p) => p.sessoes.some((s) => s.status === 'ESPERANDO_VOCE'));
        this.trocarSala((comAlerta ?? salas[0])?.chave ?? null);
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
    const naCena = this.cena().naCena;
    const ids = new Set(naCena.map((p) => p.codigo));
    for (const id of [...this.lugares.keys()]) if (!ids.has(id)) this.lugares.delete(id);
    this.ajudantes = new Map(naCena.flatMap((p) => (p.subagente ? [[p.codigo, p.subagente] as const] : [])));

    const agora = this.agora();
    const anteriores = new Map(this.agentes.map((a) => [a.codigo, a]));
    let mudou = this.agentes.length !== naCena.length;

    this.agentes = naCena.map((p) => {
      const anterior = anteriores.get(p.codigo) ?? this.novoRobo(p.codigo);
      const novo = sincronizarSessao(anterior, p.status, p.atividade, agora, this.reduzido);
      if (novo !== anterior || !anteriores.has(p.codigo)) mudou = true;
      if (!p.subagente) this.avisarSePrecisaDeVoce(this.sessoes().find((s) => s.sessaoId === p.codigo)!);
      return novo;
    });
    if (mudou) this.versao.update((v) => v + 1);
  }

  private novoRobo(codigo: string): Agente {
    const usados = new Set(this.lugares.values());
    const livre = Array.from({ length: MAXIMO_AGENTES }, (_, i) => i).find((i) => !usados.has(i)) ?? 0;
    this.lugares.set(codigo, livre);
    const { mesa, canto } = lugarDe(livre);
    return novoAgente(codigo, canto, mesa);
  }

  private permissoesAvisadas = new Set<string>();

  private avisarSePrecisaDeVoce(s: SessaoAoVivo): void {
    const permissao = s.permissaoPendente;
    if (permissao && !this.permissoesAvisadas.has(permissao.permissaoId)) {
      this.permissoesAvisadas.add(permissao.permissaoId);
      this.anuncio.set(`${this.apelido(s.sessaoId)} pede permissão para usar ${permissao.ferramenta}${permissao.resumo ? `: ${permissao.resumo}` : ''}`);
      this.statusAnterior.set(s.sessaoId, s.status);
      return; // o pedido de permissão é o aviso mais específico: não o sobrescreve com o genérico "precisa de você"
    }
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
    this.ajudantes = new Map();
    this.selecionado.set(null);
  }
}
