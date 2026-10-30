using System.Data.Common;

namespace AgentDesk.SharedKernel;

/// <summary>
/// Abstração de acesso a conexões. Os módulos dependem desta interface,
/// nunca do Npgsql diretamente (Dependency Inversion).
/// </summary>
public interface IDbConnectionFactory
{
    /// <summary>Cria e ABRE uma nova conexão (vinda do pool do Npgsql). O chamador faz o Dispose.</summary>
    Task<DbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default);
}
