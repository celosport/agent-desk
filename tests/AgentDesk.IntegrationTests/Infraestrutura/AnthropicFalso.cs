using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace AgentDesk.IntegrationTests.Infraestrutura;

/// <summary>
/// API da Anthropic falsa: nenhum teste faz chamada real nem usa chave real. [[ADR-006 - Integração com a API da Anthropic]]
/// O comportamento é decidido sem estado entre testes:
///   pelo FINAL da chave: …INVALIDA → 401 · …LIMITE → 429 · …FORA → 529 (overloaded) · …SEMREDE → falha de rede;
///   em /v1/messages, por marcadores no texto: [recusar] → stop_reason "refusal" · [longo] → "max_tokens" ·
///   [fallback] (com fallbacks no pedido) → responde o claude-sonnet-5-5; modelo "claude-inexistente…" → 404.
/// Uso fixo em toda resposta de sucesso: 1000 de entrada, 500 de saída, 200 de leitura de cache e 100 de escrita.
/// </summary>
public sealed class AnthropicFalso
{
    public static readonly (int Entrada, int Saida, int CacheLeitura, int CacheEscrita) Uso = (1000, 500, 200, 100);
    public const string ModeloDoFallback = "claude-sonnet-5-5";

    public sealed record Pedido(HttpMethod Metodo, string Caminho, string? Chave, string? Versao, string? Beta, string? Corpo)
    {
        public JsonNode? Json => Corpo is null ? null : JsonNode.Parse(Corpo);
    }

    private readonly ConcurrentQueue<Pedido> _pedidos = new();

    /// <summary>Pedidos feitos com uma chave (cada teste usa uma chave própria, então não há interferência).</summary>
    public IReadOnlyList<Pedido> PedidosDa(string chave) => _pedidos.Where(p => p.Chave == chave).ToList();

    /// <summary>Gera uma chave de teste única com o final que escolhe o comportamento.</summary>
    public static string NovaChave(string final = "OK01") => $"sk-ant-teste-{Guid.NewGuid():N}-{final}";

    internal async Task<HttpResponseMessage> ResponderAsync(HttpRequestMessage pedido, CancellationToken ct)
    {
        string? Header(string nome) => pedido.Headers.TryGetValues(nome, out var v) ? string.Join(",", v) : null;
        var chave = Header("x-api-key");
        var corpo = pedido.Content is null ? null : await pedido.Content.ReadAsStringAsync(ct);
        _pedidos.Enqueue(new Pedido(pedido.Method, pedido.RequestUri!.PathAndQuery, chave, Header("anthropic-version"), Header("anthropic-beta"), corpo));

        if (chave is null) return Erro(HttpStatusCode.Unauthorized, "authentication_error", "x-api-key header is required");
        if (chave.EndsWith("SEMREDE", StringComparison.Ordinal)) throw new HttpRequestException("Falha de rede simulada.");
        if (chave.EndsWith("INVALIDA", StringComparison.Ordinal)) return Erro(HttpStatusCode.Unauthorized, "authentication_error", "invalid x-api-key");
        if (chave.EndsWith("LIMITE", StringComparison.Ordinal)) return Erro(HttpStatusCode.TooManyRequests, "rate_limit_error", "rate limited");
        if (chave.EndsWith("FORA", StringComparison.Ordinal)) return Erro((HttpStatusCode)529, "overloaded_error", "overloaded");

        var caminho = pedido.RequestUri.AbsolutePath;
        if (pedido.Method == HttpMethod.Get && caminho == "/v1/models")
            return Json(HttpStatusCode.OK, """
                {"data":[{"type":"model","id":"claude-opus-5-5","display_name":"Claude Opus 5.5","created_at":"2026-09-01T00:00:00Z"}],
                 "has_more":true,"first_id":"claude-opus-5-5","last_id":"claude-opus-5-5"}
                """);
        if (pedido.Method == HttpMethod.Post && caminho == "/v1/messages") return Mensagem(JsonNode.Parse(corpo!)!);

        return Erro(HttpStatusCode.NotFound, "not_found_error", $"Falso sem resposta para {pedido.Method} {caminho}.");
    }

    private static HttpResponseMessage Mensagem(JsonNode corpo)
    {
        var modelo = corpo["model"]!.GetValue<string>();
        var texto = corpo["messages"]![0]!["content"]!.GetValue<string>();
        if (modelo.StartsWith("claude-inexistente", StringComparison.Ordinal))
            return Erro(HttpStatusCode.NotFound, "not_found_error", $"model: {modelo}");

        var comFallback = corpo["fallbacks"]?.GetValue<string>() == "default";
        if (texto.Contains("[fallback]") && comFallback) modelo = ModeloDoFallback;

        object resposta;
        if (texto.Contains("[recusar]"))
            resposta = new
            {
                id = "msg_falso_recusa", type = "message", role = "assistant", model = modelo, content = Array.Empty<object>(),
                stop_reason = "refusal", stop_details = new { type = "refusal", category = (string?)null },
                usage = new { input_tokens = Uso.Entrada, output_tokens = 0 },
            };
        else
            resposta = new
            {
                id = $"msg_falso_{Guid.NewGuid():N}", type = "message", role = "assistant", model = modelo,
                content = new object[]
                {
                    new { type = "thinking", thinking = "", signature = "falsa" }, // ignorado pelo cliente
                    new { type = "text", text = $"# Resultado falso\n\nModelo: {modelo}\n\n" },
                    new { type = "text", text = "Fim do resultado." },
                },
                stop_reason = texto.Contains("[longo]") ? "max_tokens" : "end_turn",
                usage = new
                {
                    input_tokens = Uso.Entrada, output_tokens = Uso.Saida,
                    cache_read_input_tokens = Uso.CacheLeitura, cache_creation_input_tokens = Uso.CacheEscrita,
                },
            };
        return Json(HttpStatusCode.OK, JsonSerializer.Serialize(resposta));
    }

    private static HttpResponseMessage Erro(HttpStatusCode status, string tipo, string mensagem)
        => Json(status, JsonSerializer.Serialize(new { type = "error", error = new { type = tipo, message = mensagem } }));

    private static HttpResponseMessage Json(HttpStatusCode status, string json)
        => new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

/// <summary>Handler primário do HttpClient da Anthropic nos testes (um por ciclo do IHttpClientFactory; o estado fica no <see cref="AnthropicFalso"/>).</summary>
internal sealed class AnthropicFalsoHandler(AnthropicFalso falso) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        => falso.ResponderAsync(request, cancellationToken);
}
