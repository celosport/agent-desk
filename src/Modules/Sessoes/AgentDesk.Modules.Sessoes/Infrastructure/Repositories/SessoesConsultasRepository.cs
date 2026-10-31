using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Texto;

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

    private sealed class LinhaSessao
    {
        public Guid UsuarioId { get; set; }
        public string SessaoId { get; set; } = string.Empty;
        public string Maquina { get; set; } = string.Empty;
        public string Projeto { get; set; } = string.Empty;
        public string ProjetoChave { get; set; } = string.Empty;
        public string? Modelo { get; set; }
        public string Status { get; set; } = "OCIOSA";
        public int Pedidos { get; set; }
        public long TokensEntrada { get; set; }
        public long TokensSaida { get; set; }
        public long TokensCacheLeitura { get; set; }
        public long TokensCacheEscrita { get; set; }
        public decimal CustoUsd { get; set; }
        public DateTimeOffset IniciadaEm { get; set; }
        public DateTimeOffset UltimaAtividadeEm { get; set; }
        public DateTimeOffset? EncerradaEm { get; set; }
        public int Compactacoes { get; set; }
        public int Edicoes { get; set; }
        public long Total { get; set; }

        public UsoCc Uso() => new(Pedidos, TokensEntrada, TokensSaida, TokensCacheLeitura, TokensCacheEscrita, CustoUsd);

        public SessaoHistorico Historico() => new(UsuarioId, SessaoId, Maquina, Projeto, ProjetoChave, Modelo, EnumTexto.Parse<StatusSessao>(Status),
            Uso(), IniciadaEm, UltimaAtividadeEm, EncerradaEm);
    }

    private sealed class LinhaEvento
    {
        public DateTimeOffset OcorridoEm { get; set; }
        public string Tipo { get; set; } = string.Empty;
        public string? Ferramenta { get; set; }
        public string? Resumo { get; set; }
        public string? Modelo { get; set; }
        public long? Tokens { get; set; }
        public decimal? CustoUsd { get; set; }
    }

    private sealed class LinhaProjeto
    {
        public string Chave { get; set; } = string.Empty;
        public string Nome { get; set; } = string.Empty;
    }

    private const string ColunasSessao = """
        usuario_id, sessao_id, maquina, projeto, projeto_chave, modelo, status, pedidos, tokens_entrada, tokens_saida, tokens_cache_leitura,
        tokens_cache_escrita, custo_usd, iniciada_em, ultima_atividade_em, encerrada_em
        """;

    /// <summary>Ferramentas que alteram arquivos (para saber se a sessão foi "só leitura").</summary>
    private static readonly string[] FerramentasDeEdicao = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

    public async Task<IReadOnlyList<SessaoResumo>> ResumosAsync(Guid? usuarioId, DateTimeOffset desde, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT {ColunasSessao},
                   (SELECT COUNT(*)::int FROM cc_eventos e WHERE e.usuario_id = s.usuario_id AND e.sessao_id = s.sessao_id
                       AND e.tipo = 'PreCompact') AS compactacoes,
                   (SELECT COUNT(*)::int FROM cc_eventos e WHERE e.usuario_id = s.usuario_id AND e.sessao_id = s.sessao_id
                       AND e.tipo = 'PreToolUse' AND e.ferramenta = ANY(@Edicao)) AS edicoes
              FROM cc_sessoes s
             WHERE (@UsuarioId::uuid IS NULL OR s.usuario_id = @UsuarioId) AND s.ultima_atividade_em >= @Desde;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaSessao>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, Desde = desde.ToUniversalTime(), Edicao = FerramentasDeEdicao }, cancellationToken: cancellationToken));
        return linhas.Select(l => new SessaoResumo(l.UsuarioId, l.SessaoId, l.Projeto, l.ProjetoChave, l.Modelo, l.Uso(), l.IniciadaEm,
            l.UltimaAtividadeEm, l.EncerradaEm, l.Compactacoes, l.Edicoes)).ToList();
    }

    public async Task<(IReadOnlyList<SessaoHistorico> Itens, int Total)> HistoricoAsync(FiltroHistoricoSessoes f, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT {ColunasSessao}, COUNT(*) OVER() AS total
              FROM cc_sessoes
             WHERE (@UsuarioId::uuid IS NULL OR usuario_id = @UsuarioId)
               AND (@ProjetoChave::text IS NULL OR projeto_chave = @ProjetoChave)
               AND iniciada_em >= @De AND iniciada_em < @Ate
             ORDER BY iniciada_em DESC, sessao_id
             LIMIT @Tamanho OFFSET @Pular;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = (await connection.QueryAsync<LinhaSessao>(new CommandDefinition(sql, new
        {
            f.UsuarioId, f.ProjetoChave, De = f.De.ToUniversalTime(), Ate = f.Ate.ToUniversalTime(), f.Tamanho, Pular = (f.Pagina - 1) * f.Tamanho,
        }, cancellationToken: cancellationToken))).ToList();
        return (linhas.Select(l => l.Historico()).ToList(), (int)(linhas.FirstOrDefault()?.Total ?? 0));
    }

    public async Task<IReadOnlyList<ProjetoOpcao>> ProjetosAsync(Guid? usuarioId, DateTimeOffset desde, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT projeto_chave AS chave, (ARRAY_AGG(projeto ORDER BY ultima_atividade_em DESC))[1] AS nome
              FROM cc_sessoes
             WHERE (@UsuarioId::uuid IS NULL OR usuario_id = @UsuarioId) AND iniciada_em >= @Desde
             GROUP BY projeto_chave ORDER BY nome;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaProjeto>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, Desde = desde.ToUniversalTime() }, cancellationToken: cancellationToken));
        return linhas.Select(l => new ProjetoOpcao(l.Chave, l.Nome)).ToList();
    }

    public async Task<(SessaoHistorico Sessao, IReadOnlyList<EventoLinha> Eventos)?> LinhaDoTempoAsync(Guid? usuarioId, string sessaoId, int limite,
        CancellationToken cancellationToken)
    {
        const string sqlSessao = $"""
            SELECT {ColunasSessao} FROM cc_sessoes
             WHERE sessao_id = @SessaoId AND (@UsuarioId::uuid IS NULL OR usuario_id = @UsuarioId)
             ORDER BY ultima_atividade_em DESC LIMIT 1;
            """;
        const string sqlEventos = """
            SELECT ocorrido_em, tipo, ferramenta, resumo, modelo,
                   CASE WHEN tipo = 'api_request'
                        THEN (COALESCE(tokens_entrada, 0) + COALESCE(tokens_saida, 0) + COALESCE(tokens_cache_leitura, 0)
                              + COALESCE(tokens_cache_escrita, 0))::bigint END AS tokens,
                   custo_usd
              FROM cc_eventos
             WHERE usuario_id = @DonoId AND sessao_id = @SessaoId
             ORDER BY ocorrido_em, evento_id LIMIT @Limite;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var sessao = await connection.QuerySingleOrDefaultAsync<LinhaSessao>(new CommandDefinition(sqlSessao,
            new { UsuarioId = usuarioId, SessaoId = sessaoId }, cancellationToken: cancellationToken));
        if (sessao is null) return null;
        var eventos = await connection.QueryAsync<LinhaEvento>(new CommandDefinition(sqlEventos,
            new { DonoId = sessao.UsuarioId, SessaoId = sessaoId, Limite = limite }, cancellationToken: cancellationToken));
        return (sessao.Historico(), eventos.Select(e => new EventoLinha(e.OcorridoEm, e.Tipo, e.Ferramenta, e.Resumo, e.Modelo, e.Tokens, e.CustoUsd)).ToList());
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
