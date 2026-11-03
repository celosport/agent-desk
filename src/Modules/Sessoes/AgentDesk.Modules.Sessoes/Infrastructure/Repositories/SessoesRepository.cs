using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Modules.Sessoes.Infrastructure.Repositories;

/// <summary>
/// <c>cc_sessoes</c> (estado atual), <c>cc_eventos</c> (linha do tempo, 90 dias) e <c>cc_consumo_diario</c> (totais para sempre).
/// Os hooks rodam em segundo plano no Claude Code e podem chegar fora de ordem: evento mais velho que a última atividade
/// entra na linha do tempo, mas não muda o status.
/// </summary>
internal sealed class SessoesRepository(IDbConnectionFactory connectionFactory) : ISessoesRepository
{
    /// <summary>Projeto provisório quando a telemetria chega antes do primeiro hook (o hook corrige depois).</summary>
    public const string ProjetoDesconhecido = "(sem projeto)";

    private sealed class Linha
    {
        public string SessaoId { get; set; } = string.Empty;
        public string Maquina { get; set; } = string.Empty;
        public string Projeto { get; set; } = string.Empty;
        public string ProjetoChave { get; set; } = string.Empty;
        public string Status { get; set; } = "OCIOSA";
        public string? Atividade { get; set; }
        public string? Modelo { get; set; }
        public long TokensEntrada { get; set; }
        public long TokensSaida { get; set; }
        public long TokensCacheLeitura { get; set; }
        public long TokensCacheEscrita { get; set; }
        public decimal CustoUsd { get; set; }
        public int Pedidos { get; set; }
        public DateTimeOffset IniciadaEm { get; set; }
        public DateTimeOffset UltimaAtividadeEm { get; set; }
        public DateTimeOffset? EncerradaEm { get; set; }
        public short? Lugar { get; set; }

        public Sessao ParaDominio() => new(SessaoId, Maquina, Projeto, ProjetoChave, EnumTexto.Parse<StatusSessao>(Status), Atividade, Modelo,
            new UsoTokens(Limitar(TokensEntrada), Limitar(TokensSaida), Limitar(TokensCacheLeitura), Limitar(TokensCacheEscrita)),
            CustoUsd, Pedidos, IniciadaEm, UltimaAtividadeEm, EncerradaEm, Lugar);

        private static int Limitar(long v) => (int)Math.Min(int.MaxValue, v);
    }

    public async Task AplicarEventoAsync(Guid usuarioId, EventoHook e, Transicao t, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO cc_sessoes (usuario_id, sessao_id, maquina, projeto, projeto_chave, status, atividade, modelo,
                                    iniciada_em, ultima_atividade_em, encerrada_em, lugar)
            VALUES (@UsuarioId, @SessaoId, @Maquina, @Projeto, @ProjetoChave, COALESCE(@Status, 'OCIOSA'), @Atividade, @Modelo,
                    @Quando, @Quando, CASE WHEN @Status = 'ENCERRADA' THEN @Quando END,
                    -- o menor lugar livre entre as sessões ainda abertas do mesmo projeto (nulo se as 8 estiverem ocupadas)
                    (SELECT MIN(n)::smallint FROM generate_series(0, 7) AS n
                      WHERE n NOT IN (SELECT lugar FROM cc_sessoes
                                       WHERE usuario_id = @UsuarioId AND projeto_chave = @ProjetoChave AND lugar IS NOT NULL
                                         AND status <> 'ENCERRADA' AND ultima_atividade_em >= @LugarDesde)))
            ON CONFLICT (usuario_id, sessao_id) DO UPDATE SET
                maquina       = EXCLUDED.maquina,
                projeto       = EXCLUDED.projeto,
                -- a telemetria pode criar a sessão antes do 1º hook (projeto provisório): o projeto certo traz o lugar certo
                lugar         = CASE WHEN cc_sessoes.projeto_chave <> EXCLUDED.projeto_chave OR cc_sessoes.lugar IS NULL
                                     THEN EXCLUDED.lugar ELSE cc_sessoes.lugar END,
                projeto_chave = EXCLUDED.projeto_chave,
                modelo        = COALESCE(EXCLUDED.modelo, cc_sessoes.modelo),
                status        = CASE WHEN @Status IS NULL OR @Quando < cc_sessoes.ultima_atividade_em THEN cc_sessoes.status ELSE @Status END,
                atividade     = CASE WHEN @Atividade IS NULL OR @Quando < cc_sessoes.ultima_atividade_em THEN cc_sessoes.atividade ELSE @Atividade END,
                encerrada_em  = CASE WHEN @Status IS NULL OR @Quando < cc_sessoes.ultima_atividade_em THEN cc_sessoes.encerrada_em
                                     WHEN @Status = 'ENCERRADA' THEN @Quando ELSE NULL END,
                iniciada_em   = LEAST(cc_sessoes.iniciada_em, @Quando),
                ultima_atividade_em = GREATEST(cc_sessoes.ultima_atividade_em, @Quando);

            INSERT INTO cc_eventos (usuario_id, sessao_id, tipo, ferramenta, resumo, modelo, ocorrido_em)
            VALUES (@UsuarioId, @SessaoId, @Evento, @Ferramenta, @Resumo, @Modelo, @Quando);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, e.SessaoId, e.Maquina, e.Projeto, e.ProjetoChave, e.Evento, e.Ferramenta, e.Resumo, e.Modelo,
            Status = t.Status?.ToTexto(), t.Atividade, Quando = e.OcorridoEm.ToUniversalTime(),
            LugarDesde = e.OcorridoEm.ToUniversalTime() - SessaoAoVivo.ForaDoEscritorio,
        }, cancellationToken: cancellationToken));

        await AplicarSubagenteAsync(connection, usuarioId, e, cancellationToken);
    }

    /// <summary>
    /// O robô do subagente: nasce no primeiro evento com <c>agent_id</c> (SubagentStart, ou uma ferramenta se o Start se perdeu),
    /// muda de atividade a cada ferramenta e termina no SubagentStop. O fim da sessão fecha todos os que ficaram abertos.
    /// Evento mais velho que a última atividade do subagente não muda nada (os hooks chegam fora de ordem).
    /// </summary>
    private static async Task AplicarSubagenteAsync(System.Data.IDbConnection connection, Guid usuarioId, EventoHook e, CancellationToken cancellationToken)
    {
        var quando = e.OcorridoEm.ToUniversalTime();
        if (e is { Evento: "SessionEnd" })
        {
            const string fechar = """
                UPDATE cc_subagentes SET encerrado_em = @Quando, ultima_atividade_em = GREATEST(ultima_atividade_em, @Quando)
                 WHERE usuario_id = @UsuarioId AND sessao_id = @SessaoId AND encerrado_em IS NULL;
                """;
            await connection.ExecuteAsync(new CommandDefinition(fechar, new { UsuarioId = usuarioId, e.SessaoId, Quando = quando }, cancellationToken: cancellationToken));
            return;
        }
        if (!e.DeSubagente) return;

        var t = Transicoes.DoSubagente(e);
        if (t.Status is null && t.Atividade is null) return;

        const string sql = """
            INSERT INTO cc_subagentes (usuario_id, sessao_id, agente_id, tipo, atividade, iniciado_em, ultima_atividade_em, encerrado_em)
            VALUES (@UsuarioId, @SessaoId, @AgenteId, @Tipo, @Atividade, @Quando, @Quando, CASE WHEN @Encerra THEN @Quando END)
            ON CONFLICT (usuario_id, sessao_id, agente_id) DO UPDATE SET
                tipo                = CASE WHEN EXCLUDED.tipo <> 'subagente' THEN EXCLUDED.tipo ELSE cc_subagentes.tipo END,
                atividade           = CASE WHEN @Atividade IS NULL OR @Quando < cc_subagentes.ultima_atividade_em THEN cc_subagentes.atividade ELSE @Atividade END,
                encerrado_em        = CASE WHEN @Quando < cc_subagentes.ultima_atividade_em THEN cc_subagentes.encerrado_em
                                           WHEN @Encerra THEN @Quando ELSE NULL END,
                iniciado_em         = LEAST(cc_subagentes.iniciado_em, @Quando),
                ultima_atividade_em = GREATEST(cc_subagentes.ultima_atividade_em, @Quando);
            """;
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, e.SessaoId, e.AgenteId, Tipo = e.AgenteTipo ?? "subagente", t.Atividade, Quando = quando,
            Encerra = t.Status == StatusSessao.Encerrada,
        }, cancellationToken: cancellationToken));
    }

    private sealed class LinhaSubagente
    {
        public string SessaoId { get; set; } = string.Empty;
        public string AgenteId { get; set; } = string.Empty;
        public string Tipo { get; set; } = string.Empty;
        public string? Atividade { get; set; }
        public DateTimeOffset IniciadoEm { get; set; }
        public DateTimeOffset UltimaAtividadeEm { get; set; }
        public DateTimeOffset? EncerradoEm { get; set; }
    }

    public async Task<IReadOnlyList<Subagente>> ListarSubagentesAsync(Guid usuarioId, DateTimeOffset ativosDesde, DateTimeOffset encerradosDesde,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT sessao_id, agente_id, tipo, atividade, iniciado_em, ultima_atividade_em, encerrado_em
              FROM cc_subagentes
             WHERE usuario_id = @UsuarioId
               AND ((encerrado_em IS NULL AND ultima_atividade_em >= @AtivosDesde) OR encerrado_em >= @EncerradosDesde)
             ORDER BY iniciado_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaSubagente>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, AtivosDesde = ativosDesde.ToUniversalTime(), EncerradosDesde = encerradosDesde.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
        return linhas.Select(l => new Subagente(l.SessaoId, l.AgenteId, l.Tipo, l.EncerradoEm is null ? StatusSessao.Trabalhando : StatusSessao.Encerrada,
            l.Atividade, l.IniciadoEm, l.UltimaAtividadeEm)).ToList();
    }

    public async Task RegistrarUsoAsync(Guid usuarioId, UsoModelo u, DateOnly diaLocal, CancellationToken cancellationToken)
    {
        const string sql = """
            WITH sessao AS (
                INSERT INTO cc_sessoes (usuario_id, sessao_id, maquina, projeto, projeto_chave, status, modelo,
                                        tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita, custo_usd, pedidos,
                                        iniciada_em, ultima_atividade_em)
                VALUES (@UsuarioId, @SessaoId, '?', @ProjetoDesconhecido, '000000000000', 'TRABALHANDO', @Modelo,
                        @Entrada, @Saida, @CacheLeitura, @CacheEscrita, @Custo, 1, @Quando, @Quando)
                ON CONFLICT (usuario_id, sessao_id) DO UPDATE SET
                    modelo               = EXCLUDED.modelo,
                    tokens_entrada       = cc_sessoes.tokens_entrada + EXCLUDED.tokens_entrada,
                    tokens_saida         = cc_sessoes.tokens_saida + EXCLUDED.tokens_saida,
                    tokens_cache_leitura = cc_sessoes.tokens_cache_leitura + EXCLUDED.tokens_cache_leitura,
                    tokens_cache_escrita = cc_sessoes.tokens_cache_escrita + EXCLUDED.tokens_cache_escrita,
                    custo_usd            = cc_sessoes.custo_usd + EXCLUDED.custo_usd,
                    pedidos              = cc_sessoes.pedidos + 1
                RETURNING projeto
            )
            INSERT INTO cc_consumo_diario (usuario_id, dia, projeto, modelo, pedidos, tokens_entrada, tokens_saida,
                                           tokens_cache_leitura, tokens_cache_escrita, custo_usd)
            SELECT @UsuarioId, @Dia, projeto, @Modelo, 1, @Entrada, @Saida, @CacheLeitura, @CacheEscrita, @Custo FROM sessao
            ON CONFLICT (usuario_id, dia, projeto, modelo) DO UPDATE SET
                pedidos              = cc_consumo_diario.pedidos + 1,
                tokens_entrada       = cc_consumo_diario.tokens_entrada + EXCLUDED.tokens_entrada,
                tokens_saida         = cc_consumo_diario.tokens_saida + EXCLUDED.tokens_saida,
                tokens_cache_leitura = cc_consumo_diario.tokens_cache_leitura + EXCLUDED.tokens_cache_leitura,
                tokens_cache_escrita = cc_consumo_diario.tokens_cache_escrita + EXCLUDED.tokens_cache_escrita,
                custo_usd            = cc_consumo_diario.custo_usd + EXCLUDED.custo_usd;

            INSERT INTO cc_eventos (usuario_id, sessao_id, tipo, modelo, tokens_entrada, tokens_saida, tokens_cache_leitura,
                                    tokens_cache_escrita, custo_usd, ocorrido_em)
            VALUES (@UsuarioId, @SessaoId, 'api_request', @Modelo, @Entrada, @Saida, @CacheLeitura, @CacheEscrita, @Custo, @Quando);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, u.SessaoId, u.Modelo, ProjetoDesconhecido, Dia = diaLocal.ToDateTime(TimeOnly.MinValue),
            Entrada = u.Uso.Entrada, Saida = u.Uso.Saida, CacheLeitura = u.Uso.CacheLeitura, CacheEscrita = u.Uso.CacheEscrita,
            Custo = u.CustoUsd, Quando = u.OcorridoEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<Sessao>> ListarAoVivoAsync(Guid usuarioId, DateTimeOffset desde, DateTimeOffset encerradasDesde,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT sessao_id, maquina, projeto, projeto_chave, status, atividade, modelo, tokens_entrada, tokens_saida,
                   tokens_cache_leitura, tokens_cache_escrita, custo_usd, pedidos, iniciada_em, ultima_atividade_em, encerrada_em, lugar
              FROM cc_sessoes
             WHERE usuario_id = @UsuarioId AND ultima_atividade_em >= @Desde
               AND (status <> 'ENCERRADA' OR encerrada_em >= @EncerradasDesde)
             ORDER BY projeto, iniciada_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, Desde = desde.ToUniversalTime(), EncerradasDesde = encerradasDesde.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<int> LimparEventosAntesDeAsync(DateTimeOffset limite, CancellationToken cancellationToken)
    {
        const string sql = "DELETE FROM cc_eventos WHERE ocorrido_em < @Limite;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new { Limite = limite.ToUniversalTime() }, cancellationToken: cancellationToken));
    }
}
