using Dapper;
using AgentDesk.Modules.Consumo.Domain;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Tempo;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Modules.Consumo.Infrastructure.Repositories;

/// <summary>
/// Leituras de <c>consumo_chamadas</c>. <c>@UsuarioId</c> nulo = todos (escopo TODOS do ADMIN). O dia é o de Brasília:
/// <c>iniciada_em AT TIME ZONE @Fuso</c>.
/// </summary>
internal sealed class ConsumoConsultasRepository(IDbConnectionFactory connectionFactory) : IConsumoConsultas
{
    private const string FiltroUsuario = "(@UsuarioId::uuid IS NULL OR usuario_id = @UsuarioId)";

    private sealed class LinhaTotais
    {
        public int Chamadas { get; set; }
        public long Tokens { get; set; }
        public decimal CustoUsd { get; set; }

        public Totais ParaDominio() => new(Chamadas, Tokens, CustoUsd);
    }

    private sealed class LinhaDia
    {
        public DateTime Dia { get; set; }
        public int Chamadas { get; set; }
        public long Tokens { get; set; }
        public decimal CustoUsd { get; set; }
    }

    private sealed class LinhaAutomacao
    {
        public Guid? AutomacaoId { get; set; }
        public string? Nome { get; set; }
        public int Chamadas { get; set; }
        public long Tokens { get; set; }
        public decimal CustoUsd { get; set; }
    }

    private sealed class LinhaChamada
    {
        public Guid ChamadaId { get; set; }
        public Guid UsuarioId { get; set; }
        public DateTimeOffset IniciadaEm { get; set; }
        public Guid? AutomacaoId { get; set; }
        public string? AutomacaoNome { get; set; }
        public string ModeloId { get; set; } = string.Empty;
        public string? ModeloUsado { get; set; }
        public int TokensEntrada { get; set; }
        public int TokensSaida { get; set; }
        public int TokensCacheLeitura { get; set; }
        public int TokensCacheEscrita { get; set; }
        public decimal CustoUsd { get; set; }
        public int DuracaoMs { get; set; }
        public string Status { get; set; } = "SUCESSO";
        public string? ErroCodigo { get; set; }
        public string? MotivoParada { get; set; }
        public string? NomeArquivo { get; set; }
        public bool TemResultado { get; set; }
        public string? Resultado { get; set; }
        public decimal? PrecoEntradaMtok { get; set; }
        public decimal? PrecoSaidaMtok { get; set; }
        public decimal? PrecoCacheLeituraMtok { get; set; }
        public decimal? PrecoCacheEscritaMtok { get; set; }

        public Chamada ParaDominio() => new(ChamadaId, UsuarioId, IniciadaEm, AutomacaoId, AutomacaoNome, ModeloId, ModeloUsado,
            new UsoTokens(TokensEntrada, TokensSaida, TokensCacheLeitura, TokensCacheEscrita), CustoUsd, DuracaoMs,
            EnumTexto.Parse<StatusChamada>(Status), ErroCodigo, MotivoParada, NomeArquivo, TemResultado, Resultado,
            PrecoEntradaMtok, PrecoSaidaMtok, PrecoCacheLeituraMtok, PrecoCacheEscritaMtok);
    }

    private const string ColunasChamada = """
        chamada_id, usuario_id, iniciada_em, automacao_id, automacao_nome, modelo_id, modelo_usado,
        tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita, custo_usd, duracao_ms, status,
        erro_codigo, motivo_parada, nome_arquivo, (resultado IS NOT NULL) AS tem_resultado
        """;

    public async Task<Totais> TotaisAsync(Guid? usuarioId, DateTimeOffset? desde, DateTimeOffset ate, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT COUNT(*)::int AS chamadas, COALESCE(SUM(tokens_total), 0)::bigint AS tokens, COALESCE(SUM(custo_usd), 0) AS custo_usd
              FROM consumo_chamadas
             WHERE {FiltroUsuario} AND (@Desde::timestamptz IS NULL OR iniciada_em >= @Desde) AND iniciada_em < @Ate;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleAsync<LinhaTotais>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, Desde = desde?.ToUniversalTime(), Ate = ate.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
        return linha.ParaDominio();
    }

    public async Task<IReadOnlyList<TotalDia>> PorDiaAsync(Guid? usuarioId, DateTimeOffset de, DateTimeOffset ate, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT (iniciada_em AT TIME ZONE @Fuso)::date AS dia, COUNT(*)::int AS chamadas,
                   COALESCE(SUM(tokens_total), 0)::bigint AS tokens, COALESCE(SUM(custo_usd), 0) AS custo_usd
              FROM consumo_chamadas
             WHERE {FiltroUsuario} AND iniciada_em >= @De AND iniciada_em < @Ate
             GROUP BY 1 ORDER BY 1;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaDia>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, De = de.ToUniversalTime(), Ate = ate.ToUniversalTime(), Fuso = FusoBrasil.Id,
        }, cancellationToken: cancellationToken));
        return linhas.Select(l => new TotalDia(DateOnly.FromDateTime(l.Dia), l.Chamadas, l.Tokens, l.CustoUsd)).ToList();
    }

    public async Task<IReadOnlyList<TotalAutomacao>> RankingAsync(Guid? usuarioId, DateTimeOffset de, DateTimeOffset ate,
        CancellationToken cancellationToken)
    {
        // Agrupa pelo id; o nome mostrado é o mais recente (o fluxo pode ter sido renomeado)
        const string sql = $"""
            SELECT automacao_id,
                   (ARRAY_AGG(automacao_nome ORDER BY iniciada_em DESC))[1] AS nome,
                   COUNT(*)::int AS chamadas, COALESCE(SUM(tokens_total), 0)::bigint AS tokens, COALESCE(SUM(custo_usd), 0) AS custo_usd
              FROM consumo_chamadas
             WHERE {FiltroUsuario} AND iniciada_em >= @De AND iniciada_em < @Ate
             GROUP BY automacao_id
             ORDER BY custo_usd DESC, chamadas DESC;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaAutomacao>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, De = de.ToUniversalTime(), Ate = ate.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
        return linhas.Select(l => new TotalAutomacao(l.AutomacaoId, l.Nome ?? "Sem automação", l.Chamadas, l.Tokens, l.CustoUsd)).ToList();
    }

    public async Task<(IReadOnlyList<Chamada> Itens, int Total, Totais Totais)> ListarAsync(FiltroHistorico f, CancellationToken cancellationToken)
    {
        const string onde = $"""
            WHERE {FiltroUsuario}
              AND (@De::timestamptz IS NULL OR iniciada_em >= @De)
              AND (@Ate::timestamptz IS NULL OR iniciada_em < @Ate)
              AND (@AutomacaoId::uuid IS NULL OR automacao_id = @AutomacaoId)
              AND (@ModeloId::text IS NULL OR modelo_id = @ModeloId OR modelo_usado = @ModeloId)
              AND (@Status::text IS NULL OR status = @Status)
            """;
        const string sql = $"""
            SELECT {ColunasChamada} FROM consumo_chamadas {onde}
             ORDER BY iniciada_em DESC, chamada_id
             LIMIT @Tamanho OFFSET @Pular;
            SELECT COUNT(*)::int AS chamadas, COALESCE(SUM(tokens_total), 0)::bigint AS tokens, COALESCE(SUM(custo_usd), 0) AS custo_usd
              FROM consumo_chamadas {onde};
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var multi = await connection.QueryMultipleAsync(new CommandDefinition(sql, new
        {
            f.UsuarioId, De = f.De?.ToUniversalTime(), Ate = f.Ate?.ToUniversalTime(), f.AutomacaoId, f.ModeloId,
            Status = f.Status?.ToTexto(), f.Tamanho, Pular = (f.Pagina - 1) * f.Tamanho,
        }, cancellationToken: cancellationToken));
        var itens = (await multi.ReadAsync<LinhaChamada>()).Select(l => l.ParaDominio()).ToList();
        var totais = (await multi.ReadSingleAsync<LinhaTotais>()).ParaDominio();
        return (itens, totais.Chamadas, totais);
    }

    public async Task<Chamada?> ObterAsync(Guid chamadaId, Guid? usuarioId, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT {ColunasChamada}, resultado, preco_entrada_mtok, preco_saida_mtok, preco_cache_leitura_mtok, preco_cache_escrita_mtok
              FROM consumo_chamadas
             WHERE chamada_id = @ChamadaId AND {FiltroUsuario};
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleOrDefaultAsync<LinhaChamada>(new CommandDefinition(
            sql, new { ChamadaId = chamadaId, UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linha?.ParaDominio();
    }

    public async Task<(IReadOnlyList<(Guid AutomacaoId, string Nome)> Automacoes, IReadOnlyList<string> Modelos)> FiltrosAsync(
        Guid? usuarioId, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT automacao_id AS AutomacaoId, (ARRAY_AGG(automacao_nome ORDER BY iniciada_em DESC))[1] AS Nome
              FROM consumo_chamadas WHERE {FiltroUsuario} AND automacao_id IS NOT NULL
             GROUP BY automacao_id ORDER BY 2;
            SELECT DISTINCT modelo FROM (
                SELECT modelo_id AS modelo FROM consumo_chamadas WHERE {FiltroUsuario}
                UNION SELECT modelo_usado FROM consumo_chamadas WHERE {FiltroUsuario} AND modelo_usado IS NOT NULL
            ) m ORDER BY 1;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var multi = await connection.QueryMultipleAsync(new CommandDefinition(
            sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        var automacoes = (await multi.ReadAsync<(Guid AutomacaoId, string Nome)>()).ToList();
        var modelos = (await multi.ReadAsync<string>()).ToList();
        return (automacoes, modelos);
    }
}
