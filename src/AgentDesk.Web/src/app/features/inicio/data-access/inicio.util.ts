import { AoVivoApi } from './inicio.models';

/** Quantas sessões do Claude Code estão trabalhando e quais salas têm alguém esperando por você. */
export interface ResumoAoVivo {
  trabalhando: number;
  esperando: number;
  ativas: number;
  salasEsperando: string[];
}

export function resumirAoVivo(aoVivo: AoVivoApi | null): ResumoAoVivo {
  const r: ResumoAoVivo = { trabalhando: 0, esperando: 0, ativas: 0, salasEsperando: [] };
  for (const p of aoVivo?.projetos ?? []) {
    let espera = false;
    for (const s of p.sessoes) {
      if (s.status === 'ENCERRADA') continue;
      r.ativas++;
      if (s.status === 'TRABALHANDO') r.trabalhando++;
      if (s.status === 'ESPERANDO_VOCE') {
        r.esperando++;
        espera = true;
      }
    }
    if (espera) r.salasEsperando.push(p.nome);
  }
  return r;
}

export type EstadoLimite = 'ok' | 'alerta' | 'estourado';

/** Mesma regra do painel de Consumo: alerta a partir de 80%, estourado a partir de 100%. */
export function estadoDoLimite(percentual: number | undefined): EstadoLimite {
  if (percentual === undefined) return 'ok';
  return percentual >= 100 ? 'estourado' : percentual >= 80 ? 'alerta' : 'ok';
}

/** Barras da assinatura: laranja a partir de 70%, vermelho a partir de 90%. */
export function nivelDaJanela(percentual: number): 'ok' | 'atencao' | 'critico' {
  return percentual >= 90 ? 'critico' : percentual >= 70 ? 'atencao' : 'ok';
}

export interface Passo {
  id: 'chave' | 'claude-code' | 'automacao';
  titulo: string;
  texto: string;
  rota: string;
  acao: string;
  feito: boolean;
}

/** "Primeiros passos": some sozinho quando tudo estiver feito. */
export function passosIniciais(estado: { chave: boolean; claudeCodeConectado: boolean; rodouAutomacao: boolean }): Passo[] {
  return [
    { id: 'chave', titulo: 'Cadastrar a sua chave da Anthropic', texto: 'Necessária para rodar as Automações. Fica cifrada e nunca volta para o navegador.',
      rota: '/configuracoes', acao: 'Abrir Configurações', feito: estado.chave },
    { id: 'claude-code', titulo: 'Conectar o Claude Code do seu computador', texto: 'Mostra as suas sessões no Escritório e o consumo delas aqui.',
      rota: '/configuracoes', acao: 'Conectar', feito: estado.claudeCodeConectado },
    { id: 'automacao', titulo: 'Rodar uma Automação', texto: 'Resumir um documento custa centavos e já enche o painel de consumo.',
      rota: '/automacoes', acao: 'Abrir Automações', feito: estado.rodouAutomacao },
  ];
}

/** "2026-11-11" → "11/11". */
export function diaCurto(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Os últimos `n` pontos da série. */
export function ultimosDias<T>(serie: readonly T[], n: number): T[] {
  return serie.slice(Math.max(0, serie.length - n));
}
