using AgentDesk.Infrastructure.Data;
using AgentDesk.Infrastructure.Integracoes;
using AgentDesk.Infrastructure.Seguranca;
using AgentDesk.SharedKernel;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace AgentDesk.Infrastructure;

public static class DependencyInjection
{
    public const string ConnectionStringName = "AgentDeskDb";

    /// <summary>
    /// Registra o acesso a dados (Npgsql + Dapper):
    ///  • NpgsqlDataSource     → Singleton (dono do pool de conexões)
    ///  • IDbConnectionFactory → Singleton (único padrão de acesso: repositórios abrem/fecham a conexão)
    ///  • TimeProvider         → Singleton (relógio testável para CriadoEm, vencimentos etc.)
    ///  • Data Protection      → anel de chaves no PostgreSQL (cifra as API keys) — ADR-005
    ///  • IClienteAnthropic    → HttpClient tipado da API da Claude — ADR-006
    /// </summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                $"ConnectionString '{ConnectionStringName}' não configurada (appsettings ou variável ConnectionStrings__{ConnectionStringName}).");

        DapperConfig.Configure();

        services.AddNpgsqlDataSource(connectionString);
        services.AddSingleton<IDbConnectionFactory, NpgsqlConnectionFactory>();
        services.TryAddSingleton(TimeProvider.System);

        services.AddProtecaoDadosNoBanco();
        services.AddClienteAnthropic(configuration);

        services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("postgresql", tags: ["db", "ready"]);

        return services;
    }
}
