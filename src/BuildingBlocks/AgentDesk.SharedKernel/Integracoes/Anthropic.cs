using AgentDesk.SharedKernel.Contratos;
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

    /// <summary>
    /// Uma chamada a <c>POST /v1/messages</c> (sem streaming). Recusa do classificador (<c>stop_reason: "refusal"</c>) volta como
    /// SUCESSO com <see cref="RespostaMensagem.Recusada"/> = true, porque os tokens foram cobrados e precisam ir para o log.
    /// </summary>
    Task<Result<RespostaMensagem>> EnviarMensagemAsync(string chaveApi, PedidoMensagem pedido, CancellationToken cancellationToken);
}

/// <param name="UsarFallback">Liga o <c>fallbacks: "default"</c> (beta) — vem da coluna <c>fallback_recusa</c> do modelo.</param>
public sealed record PedidoMensagem(string Modelo, int MaxTokens, string Sistema, string Texto, bool UsarFallback);

/// <param name="Modelo">Modelo que produziu a resposta (com fallback, pode ser outro).</param>
/// <param name="MotivoParada">stop_reason: end_turn, max_tokens, refusal...</param>
public sealed record RespostaMensagem(string? IdMensagem, string Modelo, string Texto, string? MotivoParada, UsoTokens Uso)
{
    public bool Recusada => MotivoParada == "refusal";

    /// <summary>Cortada no max_tokens: a resposta veio incompleta.</summary>
    public bool Truncada => MotivoParada == "max_tokens";
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

    public static readonly Error SemCredito = Error.Unprocessable(
        "Anthropic.SemCredito", "A conta da Anthropic desta chave está sem crédito ou sem permissão para este modelo.");

    /// <summary>400/404/413 da Anthropic (modelo inexistente, texto grande demais...). A mensagem dela vai junto, resumida.</summary>
    public static Error PedidoInvalido(string? detalhe) => Error.Unprocessable(
        "Anthropic.PedidoInvalido",
        "A Anthropic não aceitou o pedido" + (string.IsNullOrWhiteSpace(detalhe) ? "." : $": {Resumir(detalhe)}"));

    private static string Resumir(string texto) => texto.Length <= 300 ? texto : texto[..300] + "…";
}
