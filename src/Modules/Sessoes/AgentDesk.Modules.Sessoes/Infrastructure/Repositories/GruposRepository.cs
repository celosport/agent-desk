using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Sessoes.Infrastructure.Repositories;

/// <summary>Tabela <c>cc_grupos_salas</c>: quais salas (projeto_chave) o usuário juntou sob o mesmo nome.</summary>
internal sealed class GruposRepository(IDbConnectionFactory connectionFactory) : IGruposRepository
{
    public async Task<IReadOnlyDictionary<string, string>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = "SELECT projeto_chave AS Chave, grupo AS Grupo FROM cc_grupos_salas WHERE usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<(string Chave, string Grupo)>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linhas.ToDictionary(l => l.Chave, l => l.Grupo);
    }

    public async Task<bool> DefinirAsync(Guid usuarioId, string projetoChave, string? grupo, int limite, CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        if (grupo is null)
        {
            const string remover = "DELETE FROM cc_grupos_salas WHERE usuario_id = @UsuarioId AND projeto_chave = @ProjetoChave;";
            await connection.ExecuteAsync(new CommandDefinition(remover, new { UsuarioId = usuarioId, ProjetoChave = projetoChave }, cancellationToken: cancellationToken));
            return true;
        }

        // O limite é conferido e gravado no mesmo comando: duas requisições juntas não passam dele
        const string gravar = """
            INSERT INTO cc_grupos_salas (usuario_id, projeto_chave, grupo)
            SELECT @UsuarioId, @ProjetoChave, @Grupo
             WHERE (SELECT count(*) FROM cc_grupos_salas WHERE usuario_id = @UsuarioId AND projeto_chave <> @ProjetoChave) < @Limite
            ON CONFLICT (usuario_id, projeto_chave) DO UPDATE SET grupo = EXCLUDED.grupo;
            """;
        return await connection.ExecuteAsync(new CommandDefinition(gravar, new { UsuarioId = usuarioId, ProjetoChave = projetoChave, Grupo = grupo, Limite = limite },
            cancellationToken: cancellationToken)) > 0;
    }
}
