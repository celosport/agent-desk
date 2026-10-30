import { HttpErrorResponse } from '@angular/common/http';

/** application/problem+json devolvido pela API (ResultHttpExtensions.CriarProblema). */
export interface ProblemDetails {
  status?: number;
  title?: string;
  /** Código estável do erro de negócio ("Automacoes.NaoEncontrada"): decida pelo code, nunca pelo texto. */
  code?: string;
  errors?: Record<string, string[]>;
}

/** Mensagem pronta para a tela: usa o texto da API e cai para frases claras quando não há resposta. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof HttpErrorResponse) {
    if (erro.status === 0) return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
    if (erro.status === 429) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
    const problema = erro.error as ProblemDetails | null;
    // 503 com code = serviço externo fora (ex.: Anthropic.Indisponivel): a API manda uma frase pronta para a tela
    if (erro.status === 503 && problema?.code && problema.title) return problema.title;
    // Falha interna: o título padrão do ASP.NET vem em inglês e não ajuda quem usa o app
    if (erro.status >= 500) return 'Tivemos um problema no servidor. Tente de novo em instantes.';
    const primeiroCampo = problema?.errors ? Object.values(problema.errors)[0]?.[0] : undefined;
    return primeiroCampo ?? problema?.title ?? 'Não foi possível concluir. Tente de novo em instantes.';
  }
  return 'Algo deu errado. Tente de novo.';
}

export function codigoDeErro(erro: unknown): string | undefined {
  return erro instanceof HttpErrorResponse ? ((erro.error as ProblemDetails | null)?.code ?? undefined) : undefined;
}
