using AgentDesk.SharedKernel;
using Dapper;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace AgentDesk.Infrastructure.Data;

internal sealed class DatabaseHealthCheck(IDbConnectionFactory connectionFactory) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
            await connection.ExecuteScalarAsync<int>(new CommandDefinition("SELECT 1", cancellationToken: cancellationToken));
            return HealthCheckResult.Healthy("PostgreSQL acessível.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("PostgreSQL indisponível.", ex);
        }
    }
}
