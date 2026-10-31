using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Sessoes.Infrastructure.Repositories;

/// <summary><c>cc_paradas</c> e <c>cc_permissoes</c>: o que o app manda (parar, aprovar, negar) e o hook do coletor consulta.</summary>
internal sealed class ControleRepository(IDbConnectionFactory connectionFactory) : IControleRepository
{
    private sealed class LinhaPermissao
    {
        public Guid PermissaoId { get; set; }
        public Guid UsuarioId { get; set; }
        public string SessaoId { get; set; } = string.Empty;
        public string Ferramenta { get; set; } = string.Empty;
        public string? Resumo { get; set; }
        public DateTimeOffset CriadaEm { get; set; }
        public DateTimeOffset ExpiraEm { get; set; }
        public string? Decisao { get; set; }
    }

    public async Task SolicitarParadaAsync(Guid usuarioId, string sessaoId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO cc_paradas (usuario_id, sessao_id, solicitada_em, expira_em)
            VALUES (@UsuarioId, @SessaoId, @Agora, @Expira)
            ON CONFLICT (usuario_id, sessao_id) DO UPDATE SET solicitada_em = EXCLUDED.solicitada_em, expira_em = EXCLUDED.expira_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, SessaoId = sessaoId, Agora = agora.ToUniversalTime(), Expira = (agora + RegrasControle.ValidadeParada).ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }

    public async Task<bool> ConsumirParadaAsync(Guid usuarioId, string sessaoId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        // DELETE ... RETURNING: dois hooks ao mesmo tempo não consomem o mesmo pedido duas vezes
        const string sql = """
            DELETE FROM cc_paradas WHERE usuario_id = @UsuarioId AND sessao_id = @SessaoId RETURNING expira_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var expira = await connection.QuerySingleOrDefaultAsync<DateTimeOffset?>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, SessaoId = sessaoId }, cancellationToken: cancellationToken));
        return expira is { } e && e > agora;
    }

    public async Task<IReadOnlySet<string>> SessoesComParadaAsync(Guid usuarioId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = "SELECT sessao_id FROM cc_paradas WHERE usuario_id = @UsuarioId AND expira_em > @Agora;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var ids = await connection.QueryAsync<string>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, Agora = agora.ToUniversalTime() }, cancellationToken: cancellationToken));
        return ids.ToHashSet();
    }

    public async Task<bool> SessaoExisteAsync(Guid usuarioId, string sessaoId, CancellationToken cancellationToken)
    {
        const string sql = "SELECT EXISTS (SELECT 1 FROM cc_sessoes WHERE usuario_id = @UsuarioId AND sessao_id = @SessaoId);";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, SessaoId = sessaoId }, cancellationToken: cancellationToken));
    }

    public async Task<int> ContarPermissoesPendentesAsync(Guid usuarioId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = "SELECT COUNT(*)::int FROM cc_permissoes WHERE usuario_id = @UsuarioId AND decisao IS NULL AND expira_em > @Agora;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteScalarAsync<int>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, Agora = agora.ToUniversalTime() }, cancellationToken: cancellationToken));
    }

    public async Task CriarPermissaoAsync(PermissaoPendente p, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO cc_permissoes (permissao_id, usuario_id, sessao_id, ferramenta, resumo, criada_em, expira_em)
            VALUES (@PermissaoId, @UsuarioId, @SessaoId, @Ferramenta, @Resumo, @CriadaEm, @ExpiraEm);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            p.PermissaoId, p.UsuarioId, p.SessaoId, p.Ferramenta, p.Resumo, CriadaEm = p.CriadaEm.ToUniversalTime(), ExpiraEm = p.ExpiraEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<PermissaoPendente>> ListarPermissoesPendentesAsync(Guid usuarioId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT permissao_id, usuario_id, sessao_id, ferramenta, resumo, criada_em, expira_em, decisao
              FROM cc_permissoes
             WHERE usuario_id = @UsuarioId AND decisao IS NULL AND expira_em > @Agora
             ORDER BY criada_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaPermissao>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, Agora = agora.ToUniversalTime() }, cancellationToken: cancellationToken));
        return linhas.Select(l => new PermissaoPendente(l.PermissaoId, l.UsuarioId, l.SessaoId, l.Ferramenta, l.Resumo, l.CriadaEm, l.ExpiraEm)).ToList();
    }

    public async Task<(bool Existe, string? Decisao)> DecisaoAsync(Guid usuarioId, Guid permissaoId, CancellationToken cancellationToken)
    {
        const string sql = "SELECT decisao FROM cc_permissoes WHERE usuario_id = @UsuarioId AND permissao_id = @PermissaoId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = (await connection.QueryAsync<string?>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, PermissaoId = permissaoId }, cancellationToken: cancellationToken))).ToList();
        return linhas.Count == 0 ? (false, null) : (true, linhas[0]);
    }

    public async Task<ResultadoDecisao> DecidirAsync(Guid usuarioId, Guid permissaoId, string decisao, DateTimeOffset agora,
        CancellationToken cancellationToken)
    {
        // Só decide o que ainda está pendente e dentro do prazo; o UPDATE condicional impede duas decisões ao mesmo tempo
        const string sql = """
            UPDATE cc_permissoes SET decisao = @Decisao, decidida_em = @Agora
             WHERE usuario_id = @UsuarioId AND permissao_id = @PermissaoId AND decisao IS NULL AND expira_em > @Agora;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var args = new { UsuarioId = usuarioId, PermissaoId = permissaoId, Decisao = decisao, Agora = agora.ToUniversalTime() };
        if (await connection.ExecuteAsync(new CommandDefinition(sql, args, cancellationToken: cancellationToken)) == 1) return ResultadoDecisao.Decidida;

        var (existe, ja) = await DecisaoAsync(usuarioId, permissaoId, cancellationToken);
        return existe && ja is not null ? ResultadoDecisao.JaDecidida : ResultadoDecisao.NaoEncontrada; // vencida conta como não encontrada
    }

    public async Task<int> LimparAsync(DateTimeOffset limite, CancellationToken cancellationToken)
    {
        const string sql = """
            DELETE FROM cc_permissoes WHERE expira_em < @Limite;
            DELETE FROM cc_paradas WHERE expira_em < @Limite;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new { Limite = limite.ToUniversalTime() }, cancellationToken: cancellationToken));
    }
}
