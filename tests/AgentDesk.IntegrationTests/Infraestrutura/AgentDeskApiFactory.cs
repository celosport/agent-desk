using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using AgentDesk.SharedKernel.Identidade;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
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

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await connection.ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "database", "schema.sql")));

        // Lidos pelo WebApplication.CreateBuilder quando o servidor de teste sobe (1º CreateClient)
        Environment.SetEnvironmentVariable("ConnectionStrings__AgentDeskDb", _connectionString);
        Environment.SetEnvironmentVariable("Jwt__ChaveSecreta", ChaveJwtTeste);
        Environment.SetEnvironmentVariable("RateLimit__AutenticacaoPorMinuto", "1000");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment("Testing");

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

    /// <summary>Cria uma conta pela própria API e devolve um cliente HTTP já autenticado com o token dela.</summary>
    public async Task<HttpClient> ClienteNovoUsuarioAsync(string? nome = null)
    {
        var email = $"{Guid.NewGuid():N}@teste.dev";
        var resposta = await CreateClient().PostAsJsonAsync("/api/v1/auth/cadastro",
            new { nome = nome ?? "Usuário de Teste", email, senha = "Senha@2026" });
        resposta.EnsureSuccessStatusCode();
        var token = (await resposta.JsonAsync()).GetProperty("accessToken").GetString()!;

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
