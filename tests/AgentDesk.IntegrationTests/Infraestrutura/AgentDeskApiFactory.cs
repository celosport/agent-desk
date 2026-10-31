using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using AgentDesk.SharedKernel.Integracoes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace AgentDesk.IntegrationTests.Infraestrutura;

/// <summary>
/// Sobe um PostgreSQL 16 descartável (Testcontainers), aplica database/schema.sql e aponta a API para ele.
/// Compartilhado por todas as classes da coleção "api".
///
/// Sem Docker (ex.: ambiente em nuvem): defina <c>AGENTDESK_TESTES_BANCO</c> com a connection string de um PostgreSQL 16
/// em que o usuário possa criar bancos; a fábrica cria um banco descartável nele e o apaga no fim.
/// </summary>
public sealed class AgentDeskApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string ChaveJwtTeste = "chave-jwt-de-testes-de-integracao-agentdesk-0123456789";
    private static readonly string? BancoExterno = Environment.GetEnvironmentVariable("AGENTDESK_TESTES_BANCO");

    private readonly PostgreSqlContainer? _postgres = BancoExterno is not null ? null : new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").WithDatabase("agentdesk").WithUsername("agentdesk").WithPassword("agentdesk_test").Build();

    private string _connectionString = string.Empty;
    private string? _bancoCriado;

    /// <summary>API da Anthropic falsa usada por toda a coleção (nada de chamada real).</summary>
    public AnthropicFalso Anthropic { get; } = new();

    public async Task InitializeAsync()
    {
        if (_postgres is not null)
        {
            await _postgres.StartAsync();
            _connectionString = _postgres.GetConnectionString();
        }
        else
        {
            _bancoCriado = $"agentdesk_t_{Guid.NewGuid():N}";
            await using var admin = new NpgsqlConnection(BancoExterno);
            await admin.OpenAsync();
            await admin.ExecuteAsync($"CREATE DATABASE {_bancoCriado}");
            _connectionString = new NpgsqlConnectionStringBuilder(BancoExterno) { Database = _bancoCriado }.ConnectionString;
        }

        await AplicarSchemaAsync();

        // Lidos pelo WebApplication.CreateBuilder quando o servidor de teste sobe (1º CreateClient)
        Environment.SetEnvironmentVariable("ConnectionStrings__AgentDeskDb", _connectionString);
        Environment.SetEnvironmentVariable("Jwt__ChaveSecreta", ChaveJwtTeste);
        Environment.SetEnvironmentVariable("RateLimit__AutenticacaoPorMinuto", "1000");
        Environment.SetEnvironmentVariable("Sessoes__RotinaLimpezaHabilitada", "false"); // rotinas em segundo plano: desligadas nos testes
        Environment.SetEnvironmentVariable("Configuracoes__CotacoesRotinaHabilitada", "false"); // nada de chamada real ao Banco Central
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        // O HttpClient tipado da Anthropic é o cliente nomeado "IClienteAnthropic": troca só o handler primário (headers,
        // serialização e tradução de erros continuam sendo o código real)
        builder.ConfigureTestServices(s => s.AddHttpClient(nameof(IClienteAnthropic))
            .ConfigurePrimaryHttpMessageHandler(() => new AnthropicFalsoHandler(Anthropic)));
    }

    /// <summary>Roda o database/schema.sql (o mesmo do deploy). Rodar de novo testa a idempotência.</summary>
    public async Task AplicarSchemaAsync()
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await connection.ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "database", "schema.sql")));
    }

    /// <summary>Consulta direta ao banco para conferir o que a API gravou (ex.: a chave está cifrada).</summary>
    public async Task<T?> ConsultarAsync<T>(string sql, object? parametros = null)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        return await connection.QuerySingleOrDefaultAsync<T>(sql, parametros);
    }

    public async Task<int> ExecutarAsync(string sql, object? parametros = null)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        return await connection.ExecuteAsync(sql, parametros);
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        if (_postgres is not null) await _postgres.DisposeAsync();
        if (_bancoCriado is not null)
        {
            NpgsqlConnection.ClearAllPools();
            await using var admin = new NpgsqlConnection(BancoExterno);
            await admin.OpenAsync();
            await admin.ExecuteAsync($"DROP DATABASE IF EXISTS {_bancoCriado} WITH (FORCE)");
        }
    }

    private const string SenhaTeste = "Senha@2026";

    /// <summary>Cria uma conta pela própria API e devolve um cliente HTTP já autenticado com o token dela.</summary>
    public async Task<HttpClient> ClienteNovoUsuarioAsync(string? nome = null)
    {
        var email = $"{Guid.NewGuid():N}@teste.dev";
        var resposta = await CreateClient().PostAsJsonAsync("/api/v1/auth/cadastro",
            new { nome = nome ?? "Usuário de Teste", email, senha = SenhaTeste });
        resposta.EnsureSuccessStatusCode();
        return ClienteComToken((await resposta.JsonAsync()).GetProperty("accessToken").GetString()!);
    }

    /// <summary>Conta ADMIN: cadastra, promove no banco (como o promover-admin.sql) e entra de novo para o token sair com o perfil.</summary>
    public async Task<HttpClient> ClienteNovoAdminAsync()
    {
        var email = $"admin-{Guid.NewGuid():N}@teste.dev";
        (await CreateClient().PostAsJsonAsync("/api/v1/auth/cadastro", new { nome = "Admin de Teste", email, senha = SenhaTeste }))
            .EnsureSuccessStatusCode();
        await ExecutarAsync("UPDATE usuarios SET tipo_perfil = 'ADMIN' WHERE email = @Email", new { Email = email });

        var login = await CreateClient().PostAsJsonAsync("/api/v1/auth/login", new { email, senha = SenhaTeste });
        login.EnsureSuccessStatusCode();
        return ClienteComToken((await login.JsonAsync()).GetProperty("accessToken").GetString()!);
    }

    /// <summary>Usuário de teste com a API key (falsa) já salva — pronto para rodar automações.</summary>
    public sealed record UsuarioDeTeste(HttpClient Http, Guid Id, string Chave);

    public async Task<UsuarioDeTeste> UsuarioComChaveAsync(string final = "OK01", HttpClient? http = null)
    {
        http ??= await ClienteNovoUsuarioAsync();
        var chave = AnthropicFalso.NovaChave(final);
        (await http.PutAsJsonAsync("/api/v1/configuracoes/chave-api", new { chaveApi = chave })).EnsureSuccessStatusCode();
        return new UsuarioDeTeste(http, await IdAsync(http), chave);
    }

    /// <summary>Id do usuário do token (GET /auth/eu).</summary>
    public static async Task<Guid> IdAsync(HttpClient http)
        => (await (await http.GetAsync("/api/v1/auth/eu")).JsonAsync()).GetProperty("usuarioId").GetGuid();

    private HttpClient ClienteComToken(string token)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}

[CollectionDefinition(Nome)]
public sealed class ApiCollection : ICollectionFixture<AgentDeskApiFactory>
{
    public const string Nome = "api";
}

public static class HttpExtensions
{
    // Lê como texto: o corpo pode ser consultado mais de uma vez (código do erro + título)
    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response)
        => JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());

    public static async Task<string?> CodigoErroAsync(this HttpResponseMessage response)
        => (await response.JsonAsync()).TryGetProperty("code", out var code) ? code.GetString() : null;
}
