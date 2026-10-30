using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Integracoes;
using AgentDesk.SharedKernel.Results;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace AgentDesk.Infrastructure.Integracoes;

/// <summary>Configuração da integração (seção "Anthropic"). Nos testes, o handler HTTP é trocado por um falso.</summary>
public sealed class AnthropicOptions
{
    public const string Secao = "Anthropic";

    public string UrlBase { get; set; } = "https://api.anthropic.com/";
    public string Versao { get; set; } = "2026-10-21";
    public int TimeoutSegundos { get; set; } = 120;

    /// <summary>Beta do <c>fallbacks: "default"</c> (re-executa no servidor um pedido recusado pelo classificador).</summary>
    public string BetaFallback { get; set; } = "server-side-fallback-2026-07-01";
}

/// <summary>
/// HttpClient tipado da API da Anthropic. A chave vai por requisição no header <c>x-api-key</c> (redigido no log) e nunca é guardada.
/// [[ADR-006 - Integração com a API da Anthropic]]
/// </summary>
internal sealed class ClienteAnthropic(HttpClient http, AnthropicOptions opcoes, ILogger<ClienteAnthropic> log) : IClienteAnthropic
{
    public const string HeaderChave = "x-api-key";

    public async Task<Result> TestarChaveAsync(string chaveApi, CancellationToken cancellationToken)
    {
        // Listar um modelo valida a chave sem gastar tokens
        using var pedido = new HttpRequestMessage(HttpMethod.Get, "v1/models?limit=1");
        pedido.Headers.Add(HeaderChave, chaveApi);

        try
        {
            using var resposta = await http.SendAsync(pedido, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (resposta.IsSuccessStatusCode) return Result.Success();
            log.LogWarning("Anthropic: teste de chave respondeu {Status}.", (int)resposta.StatusCode);
            return Result.Failure(ErroPorStatus(resposta.StatusCode, null));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            // Rede fora ou timeout: vira 503 com mensagem clara (coberto por teste de integração)
            log.LogWarning("Anthropic: sem resposta no teste de chave ({Tipo}).", ex.GetType().Name);
            return Result.Failure(AnthropicErros.Indisponivel);
        }
    }

    public async Task<Result<RespostaMensagem>> EnviarMensagemAsync(string chaveApi, PedidoMensagem p, CancellationToken cancellationToken)
    {
        // Sem "thinking": nos modelos atuais o padrão já é o adaptativo. Sem temperature/top_p (a versão 2026-10-21 recusa).
        var corpo = new Dictionary<string, object>
        {
            ["model"] = p.Modelo,
            ["max_tokens"] = p.MaxTokens,
            ["system"] = p.Sistema,
            ["messages"] = new[] { new { role = "user", content = p.Texto } },
        };
        if (p.UsarFallback) corpo["fallbacks"] = "default";

        using var pedido = new HttpRequestMessage(HttpMethod.Post, "v1/messages") { Content = JsonContent.Create(corpo) };
        pedido.Headers.Add(HeaderChave, chaveApi);
        if (p.UsarFallback) pedido.Headers.Add("anthropic-beta", opcoes.BetaFallback);

        try
        {
            using var resposta = await http.SendAsync(pedido, cancellationToken);
            var texto = await resposta.Content.ReadAsStringAsync(cancellationToken);
            if (!resposta.IsSuccessStatusCode)
            {
                log.LogWarning("Anthropic: /v1/messages respondeu {Status} ({Modelo}).", (int)resposta.StatusCode, p.Modelo);
                return ErroPorStatus(resposta.StatusCode, MensagemDeErro(texto));
            }
            return LerResposta(texto, p.Modelo);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            log.LogWarning("Anthropic: sem resposta em /v1/messages ({Tipo}).", ex.GetType().Name);
            return AnthropicErros.Indisponivel;
        }
        catch (JsonException)
        {
            log.LogWarning("Anthropic: resposta de /v1/messages fora do formato esperado.");
            return AnthropicErros.Indisponivel;
        }
    }

    /// <summary>Junta os blocos "text" (blocos "thinking" e "fallback" são ignorados) e lê o usage.</summary>
    internal static RespostaMensagem LerResposta(string json, string modeloPedido)
    {
        using var doc = JsonDocument.Parse(json);
        var raiz = doc.RootElement;

        var texto = new StringBuilder();
        if (raiz.TryGetProperty("content", out var blocos) && blocos.ValueKind == JsonValueKind.Array)
            foreach (var bloco in blocos.EnumerateArray())
                if (Texto(bloco, "type") == "text") texto.Append(Texto(bloco, "text"));

        var uso = raiz.TryGetProperty("usage", out var u)
            ? new UsoTokens(Inteiro(u, "input_tokens"), Inteiro(u, "output_tokens"),
                Inteiro(u, "cache_read_input_tokens"), Inteiro(u, "cache_creation_input_tokens"))
            : UsoTokens.Zero;

        return new RespostaMensagem(Texto(raiz, "id"), Texto(raiz, "model") ?? modeloPedido, texto.ToString(), Texto(raiz, "stop_reason"), uso);
    }

    /// <summary>401 = chave recusada; 403/402 = sem permissão/crédito; 429 = limite; 400/404/413 = pedido; o resto (5xx, 529) = fora.</summary>
    internal static Error ErroPorStatus(HttpStatusCode status, string? detalhe) => (int)status switch
    {
        401 => AnthropicErros.ChaveInvalida,
        402 or 403 => AnthropicErros.SemCredito,
        429 => AnthropicErros.LimiteDeTaxa,
        400 or 404 or 413 => AnthropicErros.PedidoInvalido(detalhe),
        _ => AnthropicErros.Indisponivel,
    };

    private static string? MensagemDeErro(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("error", out var e) ? Texto(e, "message") : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? Texto(JsonElement e, string nome)
        => e.TryGetProperty(nome, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int Inteiro(JsonElement e, string nome)
        => e.TryGetProperty(nome, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;
}

internal static class ClienteAnthropicExtensions
{
    public static IServiceCollection AddClienteAnthropic(this IServiceCollection services, IConfiguration configuration)
    {
        var opcoes = configuration.GetSection(AnthropicOptions.Secao).Get<AnthropicOptions>() ?? new AnthropicOptions();
        services.AddSingleton(opcoes);

        services.AddHttpClient<IClienteAnthropic, ClienteAnthropic>(c =>
            {
                c.BaseAddress = new Uri(opcoes.UrlBase.EndsWith('/') ? opcoes.UrlBase : opcoes.UrlBase + "/");
                c.Timeout = TimeSpan.FromSeconds(opcoes.TimeoutSegundos);
                c.DefaultRequestHeaders.Add("anthropic-version", opcoes.Versao);
            })
            .RedactLoggedHeaders([ClienteAnthropic.HeaderChave]);

        return services;
    }
}
