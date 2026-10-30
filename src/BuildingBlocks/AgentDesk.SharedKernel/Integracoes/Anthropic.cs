using AgentDesk.SharedKernel.Results;

namespace AgentDesk.SharedKernel.Integracoes;

/// <summary>
/// Cliente da API da Anthropic (Claude). Implementado em AgentDesk.Infrastructure com HttpClient; os módulos só conhecem este
/// contrato. A chave vem do usuário a cada chamada e nunca é guardada aqui. [[ADR-006 - Integração com a API da Anthropic]]
/// </summary>
public interface IClienteAnthropic
{
    /// <summary>Confere se a chave é aceita pela Anthropic sem gastar tokens (lista um modelo).</summary>
    Task<Result> TestarChaveAsync(string chaveApi, CancellationToken cancellationToken);
}

/// <summary>Erros estáveis da integração (o front decide pelo <c>code</c>).</summary>
public static class AnthropicErros
{
    public static readonly Error ChaveInvalida = Error.Unprocessable(
        "Anthropic.ChaveInvalida", "A Anthropic recusou a chave. Confira se ela foi copiada inteira e se ainda está ativa.");

    public static readonly Error LimiteDeTaxa = Error.Unavailable(
        "Anthropic.LimiteDeTaxa", "A Anthropic está limitando as chamadas desta chave. Aguarde um pouco e tente de novo.");

    public static readonly Error Indisponivel = Error.Unavailable(
        "Anthropic.Indisponivel", "A API da Anthropic não respondeu. Tente de novo em instantes.");
}
