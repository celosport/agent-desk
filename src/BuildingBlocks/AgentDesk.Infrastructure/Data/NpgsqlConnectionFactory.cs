using System.Data.Common;
using AgentDesk.SharedKernel;
using Npgsql;

namespace AgentDesk.Infrastructure.Data;

/// <summary>
/// Implementação baseada no NpgsqlDataSource (singleton thread-safe que gerencia o pool).
/// </summary>
internal sealed class NpgsqlConnectionFactory(NpgsqlDataSource dataSource) : IDbConnectionFactory
{
    public async Task<DbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default)
        => await dataSource.OpenConnectionAsync(cancellationToken);
}
