using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Sessoes.Infrastructure.Repositories;

/// <summary>
/// Leituras agregadas de <c>cc_consumo_diario</c> (totais por dia de Brasília, projeto e modelo, guardados para sempre) e de
/// <c>cc_eventos</c> (ferramentas, 90 dias). Sem filtro de usuário = todos (o controller só permite ao ADMIN).
/// </summary>
internal sealed class SessoesConsultasRepository(IDbConnectionFactory connectionFactory) : ISessoesConsultas
{
    private const string FiltroUsuario = "(@UsuarioId::uuid IS NULL OR usuario_id = @UsuarioId)";

    private const string Somas = """
        COALESCE(SUM(pedidos), 0)::bigint AS pedidos, COALESCE(SUM(tokens_entrada), 0)::bigint AS entrada,
        COALESCE(SUM(tokens_saida), 0)::bigint AS saida, COALESCE(SUM(tokens_cache_leitura), 0)::bigint AS cache_leitura,
        COALESCE(SUM(tokens_cache_escrita), 0)::bigint AS cache_escrita, COALESCE(SUM(custo_usd), 0) AS custo_usd
        """;

    private sealed class Linha
    {
        public DateTime Dia { get; set; }
        public string Nome { get; set; } = string.Empty;
        public long Pedidos { get; set; }
        public long Entrada { get; set; }
        public long Saida { get; set; }
        public long CacheLeitura { get; set; }
        public long CacheEscrita { get; set; }
        public decimal CustoUsd { get; set; }

        public UsoCc Uso() => new(Pedidos, Entrada, Saida, CacheLeitura, CacheEscrita, CustoUsd);
    }

    private sealed class LinhaFerramenta
    {
        public string Ferramenta { get; set; } = string.Empty;
        public long Usos { get; set; }
    }

    public async Task<UsoCc> TotaisAsync(Guid? usuarioId, DateOnly? de, DateOnly? ate, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT {Somas} FROM cc_consumo_diario
             WHERE {FiltroUsuario} AND (@De::date IS NULL OR dia >= @De) AND (@Ate::date IS NULL OR dia <= @Ate);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId, De = de, Ate = ate },
            cancellationToken: cancellationToken));
        return linha.Uso();
    }

    public async Task<IReadOnlyList<UsoDia>> PorDiaAsync(Guid? usuarioId, DateOnly de, DateOnly ate, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT dia, {Somas} FROM cc_consumo_diario
             WHERE {FiltroUsuario} AND dia >= @De AND dia <= @Ate GROUP BY dia ORDER BY dia;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId, De = de, Ate = ate },
            cancellationToken: cancellationToken));
        return linhas.Select(l => new UsoDia(DateOnly.FromDateTime(l.Dia), l.Uso())).ToList();
    }

    public Task<IReadOnlyList<UsoNomeado>> PorProjetoAsync(Guid? usuarioId, DateOnly de, DateOnly ate, CancellationToken cancellationToken)
        => PorColunaAsync("projeto", usuarioId, de, ate, cancellationToken);

    public Task<IReadOnlyList<UsoNomeado>> PorModeloAsync(Guid? usuarioId, DateOnly de, DateOnly ate, CancellationToken cancellationToken)
        => PorColunaAsync("modelo", usuarioId, de, ate, cancellationToken);

    // A coluna vem de uma lista fixa do código (nunca do usuário): seguro concatenar o nome dela no SQL
    private async Task<IReadOnlyList<UsoNomeado>> PorColunaAsync(string coluna, Guid? usuarioId, DateOnly de, DateOnly ate,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT {coluna} AS nome, {Somas} FROM cc_consumo_diario
             WHERE {FiltroUsuario} AND dia >= @De AND dia <= @Ate
             GROUP BY {coluna} ORDER BY SUM(custo_usd) DESC, {coluna};
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId, De = de, Ate = ate },
            cancellationToken: cancellationToken));
        return linhas.Select(l => new UsoNomeado(l.Nome, l.Uso())).ToList();
    }

    public async Task<IReadOnlyList<UsoFerramenta>> FerramentasAsync(Guid? usuarioId, DateTimeOffset de, DateTimeOffset ate, int limite,
        CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT ferramenta, COUNT(*)::bigint AS usos FROM cc_eventos
             WHERE {FiltroUsuario} AND tipo = 'PreToolUse' AND ferramenta IS NOT NULL AND ocorrido_em >= @De AND ocorrido_em < @Ate
             GROUP BY ferramenta ORDER BY usos DESC, ferramenta LIMIT @Limite;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaFerramenta>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, De = de.ToUniversalTime(), Ate = ate.ToUniversalTime(), Limite = limite,
        }, cancellationToken: cancellationToken));
        return linhas.Select(l => new UsoFerramenta(l.Ferramenta, l.Usos)).ToList();
    }
}
