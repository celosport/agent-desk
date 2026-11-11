// "Quem está onde e fazendo o quê": o texto que acompanha cada robô pelos ambientes do andar (funções puras, testadas no Vitest).
import { Agente, descreverFase } from './agente';
import { Ambiente, ROTULO_AMBIENTE, ambienteDe } from './mapa';
import { Motivo } from './vida';

export interface Acompanhamento {
  codigo: string;
  /** Ambiente em que o robô está agora ("Cozinha", "Corredor"…) ou "Fora do andar" se foi embora pelo elevador. */
  onde: string;
  ambiente: Ambiente | null;
  /** O que está fazendo ("tomando um café, esperando você"). */
  oque: string;
}

const FAZENDO: Record<Motivo, string> = {
  JANELA: 'olhando pela janela',
  AGUA: 'tomando uma água',
  CAFE: 'tomando um café',
  PIA: 'lavando as mãos',
  BANHEIRO: 'no banheiro',
  SOFA: 'assistindo TV no sofá',
  ESPREGUICAR: 'se espreguiçando',
  OLHAR_AO_REDOR: 'olhando ao redor',
};

const INDO: Record<Motivo, string> = {
  JANELA: 'indo olhar pela janela',
  AGUA: 'indo tomar uma água',
  CAFE: 'indo tomar um café',
  PIA: 'indo lavar as mãos',
  BANHEIRO: 'indo ao banheiro',
  SOFA: 'indo descansar no sofá',
  ESPREGUICAR: 'indo se espreguiçar',
  OLHAR_AO_REDOR: 'passeando',
};

/** Onde o robô está e o que faz neste instante. */
export function acompanhar(a: Agente): Acompanhamento {
  if (a.fase === 'AUSENTE') return { codigo: a.codigo, onde: 'Fora do andar', ambiente: null, oque: 'foi embora (ponto batido)' };
  const ambiente = ambienteDe(a.posicao);
  let oque: string;
  if (a.fase === 'OCIOSO') {
    const v = a.vida;
    oque =
      v.acao === 'PARADO' ? FAZENDO[v.motivo] : v.acao === 'INDO' ? INDO[v.motivo] : v.acao === 'VOLTANDO' ? 'voltando para o seu canto' : 'disponível';
  } else if (a.fase === 'PENSANDO') {
    oque = a.balao?.tipo === 'atividade' ? `trabalhando: ${a.balao.texto}` : 'trabalhando na mesa';
  } else if (a.fase === 'INDO') {
    oque = 'indo para a mesa';
  } else {
    oque = descreverFase(a);
  }
  return { codigo: a.codigo, onde: ROTULO_AMBIENTE[ambiente], ambiente, oque };
}
