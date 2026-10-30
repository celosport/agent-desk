using Dapper;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Contas.Infrastructure;

/// <summary>Contrato <see cref="IDiretorioUsuarios"/> para os outros módulos: só o nome, nunca e-mail ou senha.</summary>
internal sealed class DiretorioUsuarios(IDbConnectionFactory connectionFactory) : IDiretorioUsuarios
{
    public async Task<IReadOnlyDictionary<Guid, string>> NomesAsync(IReadOnlyCollection<Guid> usuarioIds, CancellationToken cancellationToken)
    {
        if (usuarioIds.Count == 0) return new Dictionary<Guid, string>();
        const string sql = "SELECT usuario_id AS UsuarioId, nome AS Nome FROM usuarios WHERE usuario_id = ANY(@Ids);";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<(Guid UsuarioId, string Nome)>(new CommandDefinition(
            sql, new { Ids = usuarioIds.Distinct().ToArray() }, cancellationToken: cancellationToken));
        return linhas.ToDictionary(l => l.UsuarioId, l => l.Nome);
    }
}
