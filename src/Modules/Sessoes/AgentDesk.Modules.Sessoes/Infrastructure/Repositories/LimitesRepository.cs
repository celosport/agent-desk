using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Sessoes.Infrastructure.Repositories;

/// <summary>Tabela <c>cc_limites</c>: a última leitura das janelas de 5 horas e da semana de cada usuário.</summary>
internal sealed class LimitesRepository(IDbConnectionFactory connectionFactory) : ILimitesRepository
{
    private sealed class Linha
    {
        public string Janela { get; set; } = string.Empty;
        public decimal Percentual { get; set; }
        public DateTimeOffset RenovaEm { get; set; }
        public DateTimeOffset AtualizadoEm { get; set; }
    }

    public async Task SalvarAsync(Guid usuarioId, IReadOnlyList<LimiteJanela> janelas, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO cc_limites (usuario_id, janela, percentual, renova_em, atualizado_em)
            VALUES (@UsuarioId, @Janela, @Percentual, @RenovaEm, @AtualizadoEm)
            ON CONFLICT (usuario_id, janela) DO UPDATE SET
                percentual = EXCLUDED.percentual, renova_em = EXCLUDED.renova_em, atualizado_em = EXCLUDED.atualizado_em
            WHERE cc_limites.atualizado_em <= EXCLUDED.atualizado_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        foreach (var j in janelas)
            await connection.ExecuteAsync(new CommandDefinition(sql, new
            {
                UsuarioId = usuarioId, j.Janela, j.Percentual, RenovaEm = j.RenovaEm.ToUniversalTime(), AtualizadoEm = j.AtualizadoEm.ToUniversalTime(),
            }, cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<LimiteJanela>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = "SELECT janela, percentual, renova_em, atualizado_em FROM cc_limites WHERE usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linhas.Select(l => new LimiteJanela(l.Janela, l.Percentual, l.RenovaEm, l.AtualizadoEm)).ToList();
    }
}
