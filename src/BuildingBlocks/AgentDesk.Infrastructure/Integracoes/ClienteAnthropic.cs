using System.Net;
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
}

/// <summary>
/// HttpClient tipado da API da Anthropic. A chave vai por requisição no header <c>x-api-key</c> (redigido no log) e nunca é guardada.
/// [[ADR-006 - Integração com a API da Anthropic]]
/// </summary>
internal sealed class ClienteAnthropic(HttpClient http, ILogger<ClienteAnthropic> log) : IClienteAnthropic
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
            return Result.Failure(ErroPorStatus(resposta.StatusCode));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            // Rede fora ou timeout: vira 503 com mensagem clara (coberto por teste de integração)
            log.LogWarning("Anthropic: sem resposta no teste de chave ({Tipo}).", ex.GetType().Name);
            return Result.Failure(AnthropicErros.Indisponivel);
        }
    }

    /// <summary>401/403 = chave recusada; 429 = limite de taxa; o resto (5xx, 529 "overloaded") = indisponível.</summary>
    internal static Error ErroPorStatus(HttpStatusCode status) => status switch
    {
        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => AnthropicErros.ChaveInvalida,
        HttpStatusCode.TooManyRequests => AnthropicErros.LimiteDeTaxa,
        _ => AnthropicErros.Indisponivel,
    };
}

internal static class ClienteAnthropicExtensions
{
    public static IServiceCollection AddClienteAnthropic(this IServiceCollection services, IConfiguration configuration)
    {
        var opcoes = configuration.GetSection(AnthropicOptions.Secao).Get<AnthropicOptions>() ?? new AnthropicOptions();

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
