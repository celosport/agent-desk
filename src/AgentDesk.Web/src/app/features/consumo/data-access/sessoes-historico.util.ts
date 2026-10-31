import { formatarDuracao, formatarDolarCompacto, formatarHora, formatarNumero } from '../../../shared/util/formatos';
import { EventoLinha } from './claude-code.models';

/** Texto de cada item da linha do tempo. Hooks de pós-ferramenta são ruído: `descreverEvento` devolve null e a tela os esconde. */
export function descreverEvento(e: EventoLinha): string | null {
  const alvo = [e.ferramenta, e.resumo].filter(Boolean).join(': ');
  switch (e.tipo) {
    case 'SessionStart':
      return 'Sessão aberta';
    case 'UserPromptSubmit':
      return 'Você fez um pedido';
    case 'PreToolUse':
      return alvo || 'Usou uma ferramenta';
    case 'PostToolUse':
      return null;
    case 'PostToolUseFailure':
      return `Falhou: ${e.ferramenta ?? 'ferramenta'}`;
    case 'Notification':
      return e.resumo ? `Pediu a sua atenção: ${e.resumo}` : 'Pediu a sua atenção';
    case 'Stop':
      return 'Terminou a resposta';
    case 'SubagentStart':
      return e.resumo ? `Chamou um subagente: ${e.resumo}` : 'Chamou um subagente';
    case 'SubagentStop':
      return 'Subagente terminou';
    case 'PreCompact':
      return 'Compactou o contexto';
    case 'SessionEnd':
      return 'Sessão encerrada';
    case 'api_request': {
      const partes = [e.modelo ?? 'modelo', e.tokens !== undefined ? `${formatarNumero(e.tokens)} tokens` : null, e.custoUsd !== undefined ? `≈ ${formatarDolarCompacto(e.custoUsd)}` : null];
      return `Chamada ao modelo · ${partes.filter(Boolean).join(' · ')}`;
    }
    default:
      return e.tipo;
  }
}

export interface GrupoHora {
  /** "14h" (hora de Brasília). */
  rotulo: string;
  itens: { hora: string; texto: string; tipo: string }[];
}

/** Agrupa a linha do tempo hora a hora (horário de Brasília), escondendo o que não tem texto. Mantém a ordem. */
export function agruparPorHora(eventos: EventoLinha[]): GrupoHora[] {
  const grupos: GrupoHora[] = [];
  for (const e of eventos) {
    const texto = descreverEvento(e);
    if (texto === null) continue;
    const hora = formatarHora(e.ocorridoEm);
    const rotulo = `${hora.slice(0, 2)}h`;
    let grupo = grupos[grupos.length - 1];
    if (!grupo || grupo.rotulo !== rotulo) {
      grupo = { rotulo, itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push({ hora, texto, tipo: e.tipo });
  }
  return grupos;
}

/** "1 h 30 min" a partir de milissegundos (a duração da sessão). */
export const duracaoDaSessao = formatarDuracao;
