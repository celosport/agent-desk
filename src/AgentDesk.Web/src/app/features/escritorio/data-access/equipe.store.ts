import { Injectable, computed, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../../../core/http/problema';
import { Personagem, paletaDeCores, personagemDe, personagemDeSessao } from '../motor/personagens';
import { EquipeApi } from './equipe.api';
import { AgenteEquipe, AlvoAgente, SalvarAgenteEquipe } from './equipe.models';

const chaveDe = (alvo: AlvoAgente, chave: string, ordem: number) => `${alvo}|${chave}|${ordem}`;

/** Nome e aparência dos agentes do usuário. O que não foi personalizado cai no visual automático do Escritório. */
@Injectable()
export class EquipeStore {
  private readonly api = inject(EquipeApi);

  readonly agentes = signal<AgenteEquipe[]>([]);
  readonly carregado = signal(false);
  readonly erro = signal<string | null>(null);

  private readonly porChave = computed(() => new Map(this.agentes().map((a) => [chaveDe(a.alvo, a.chave, a.ordem), a])));

  async carregar(): Promise<void> {
    try {
      this.agentes.set(await this.api.listar());
      this.erro.set(null);
    } catch (e) {
      // Sem a equipe o Escritório funciona com o visual automático; só avisa
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregado.set(true);
    }
  }

  obter(alvo: AlvoAgente, chave: string, ordem: number): AgenteEquipe | null {
    return this.porChave().get(chaveDe(alvo, chave, ordem)) ?? null;
  }

  visualAutomacao(codigo: string): Personagem {
    const a = this.obter('AUTOMACAO', codigo, 0);
    return a ? paraPersonagem(a) : personagemDe(codigo);
  }

  /** `lugar` = a posição do robô na sala (0 a 7): a 1ª sessão a chegar usa o agente de ordem 0, e assim por diante. */
  visualSessao(projetoChave: string | null, lugar: number | undefined, sessaoId: string): Personagem {
    const a = projetoChave !== null && lugar !== undefined ? this.obter('PROJETO', projetoChave, lugar) : null;
    return a ? paraPersonagem(a) : personagemDeSessao(sessaoId);
  }

  async salvar(agente: SalvarAgenteEquipe): Promise<void> {
    const salvo = await this.api.salvar(agente);
    this.agentes.update((lista) => [...lista.filter((x) => chaveDe(x.alvo, x.chave, x.ordem) !== chaveDe(salvo.alvo, salvo.chave, salvo.ordem)), salvo]);
  }

  async restaurar(alvo: AlvoAgente, chave: string, ordem: number): Promise<void> {
    await this.api.restaurar(alvo, chave, ordem);
    this.agentes.update((lista) => lista.filter((x) => chaveDe(x.alvo, x.chave, x.ordem) !== chaveDe(alvo, chave, ordem)));
  }
}

export function paraPersonagem(a: AgenteEquipe): Personagem {
  return {
    apelido: a.nome,
    paleta: paletaDeCores(a.corCabeca, a.corCorpo, a.corDetalhe, a.corOlhos),
    acessorio: a.acessorio,
    antena: a.antena,
    expressao: a.expressao,
  };
}
