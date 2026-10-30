using System.Collections.Concurrent;
using System.Net;
using System.Text;

namespace AgentDesk.IntegrationTests.Infraestrutura;

/// <summary>
/// API da Anthropic falsa: nenhum teste faz chamada real nem usa chave real. [[ADR-006 - Integração com a API da Anthropic]]
/// O comportamento é decidido pelo FINAL da chave (sem estado entre testes):
///   …INVALIDA → 401 · …LIMITE → 429 · …FORA → 529 (overloaded) · …SEMREDE → falha de rede · qualquer outra → sucesso.
/// </summary>
public sealed class AnthropicFalso
{
    public sealed record Pedido(HttpMethod Metodo, string Caminho, string? Chave, string? Versao, string? Corpo);

    private readonly ConcurrentQueue<Pedido> _pedidos = new();

    public IReadOnlyCollection<Pedido> Pedidos => _pedidos;

    /// <summary>Pedidos feitos com uma chave (cada teste usa uma chave própria, então não há interferência).</summary>
    public IReadOnlyList<Pedido> PedidosDa(string chave) => _pedidos.Where(p => p.Chave == chave).ToList();

    /// <summary>Gera uma chave de teste única com o final que escolhe o comportamento.</summary>
    public static string NovaChave(string final = "OK01") => $"sk-ant-teste-{Guid.NewGuid():N}-{final}";

    internal async Task<HttpResponseMessage> ResponderAsync(HttpRequestMessage pedido, CancellationToken ct)
    {
        var chave = pedido.Headers.TryGetValues("x-api-key", out var v) ? v.Single() : null;
        var versao = pedido.Headers.TryGetValues("anthropic-version", out var ver) ? ver.Single() : null;
        var corpo = pedido.Content is null ? null : await pedido.Content.ReadAsStringAsync(ct);
        _pedidos.Enqueue(new Pedido(pedido.Method, pedido.RequestUri!.PathAndQuery, chave, versao, corpo));

        if (chave is null) return Erro(HttpStatusCode.Unauthorized, "authentication_error", "x-api-key header is required");
        if (chave.EndsWith("SEMREDE", StringComparison.Ordinal)) throw new HttpRequestException("Falha de rede simulada.");
        if (chave.EndsWith("INVALIDA", StringComparison.Ordinal)) return Erro(HttpStatusCode.Unauthorized, "authentication_error", "invalid x-api-key");
        if (chave.EndsWith("LIMITE", StringComparison.Ordinal)) return Erro(HttpStatusCode.TooManyRequests, "rate_limit_error", "rate limited");
        if (chave.EndsWith("FORA", StringComparison.Ordinal)) return Erro((HttpStatusCode)529, "overloaded_error", "overloaded");

        if (pedido.Method == HttpMethod.Get && pedido.RequestUri.AbsolutePath == "/v1/models")
            return Json(HttpStatusCode.OK, """
                {"data":[{"type":"model","id":"claude-opus-5-5","display_name":"Claude Opus 5.5","created_at":"2026-09-01T00:00:00Z"}],
                 "has_more":true,"first_id":"claude-opus-5-5","last_id":"claude-opus-5-5"}
                """);

        return Erro(HttpStatusCode.NotFound, "not_found_error", $"Falso sem resposta para {pedido.Method} {pedido.RequestUri.AbsolutePath}.");
    }

    private static HttpResponseMessage Erro(HttpStatusCode status, string tipo, string mensagem)
        => Json(status, $$$"""{"type":"error","error":{"type":"{{{tipo}}}","message":"{{{mensagem}}}"}}""");

    private static HttpResponseMessage Json(HttpStatusCode status, string json)
        => new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

/// <summary>Handler primário do HttpClient da Anthropic nos testes (um por ciclo do IHttpClientFactory; o estado fica no <see cref="AnthropicFalso"/>).</summary>
internal sealed class AnthropicFalsoHandler(AnthropicFalso falso) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        => falso.ResponderAsync(request, cancellationToken);
}
