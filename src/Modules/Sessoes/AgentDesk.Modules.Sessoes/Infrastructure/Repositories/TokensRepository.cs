using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Sessoes.Infrastructure.Repositories;

/// <summary>Tabela <c>tokens_ingestao</c> (só hashes).</summary>
internal sealed class TokensRepository(IDbConnectionFactory connectionFactory) : ITokensRepository
{
    private sealed class Linha
    {
        public Guid TokenId { get; set; }
        public Guid UsuarioId { get; set; }
        public string Nome { get; set; } = string.Empty;
        public string Prefixo { get; set; } = string.Empty;
        public string HashSha256 { get; set; } = string.Empty;
        public DateTimeOffset CriadoEm { get; set; }
        public DateTimeOffset? UltimoUsoEm { get; set; }
        public DateTimeOffset? RevogadoEm { get; set; }

        public TokenIngestao ParaDominio() => new(TokenId, UsuarioId, Nome, Prefixo, HashSha256, CriadoEm, UltimoUsoEm, RevogadoEm);
    }

    public async Task InserirAsync(TokenIngestao t, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO tokens_ingestao (token_id, usuario_id, nome, prefixo, hash_sha256, criado_em)
            VALUES (@TokenId, @UsuarioId, @Nome, @Prefixo, @HashSha256, @CriadoEm);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            t.TokenId, t.UsuarioId, t.Nome, t.Prefixo, t.HashSha256, CriadoEm = t.CriadoEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<TokenIngestao>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT token_id, usuario_id, nome, prefixo, hash_sha256, criado_em, ultimo_uso_em, revogado_em
              FROM tokens_ingestao WHERE usuario_id = @UsuarioId
             ORDER BY (revogado_em IS NULL) DESC, criado_em DESC;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<int> ContarAtivosAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = "SELECT COUNT(*)::int FROM tokens_ingestao WHERE usuario_id = @UsuarioId AND revogado_em IS NULL;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteScalarAsync<int>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
    }

    public async Task<bool> RevogarAsync(Guid usuarioId, Guid tokenId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = """
            UPDATE tokens_ingestao SET revogado_em = @Agora
             WHERE token_id = @TokenId AND usuario_id = @UsuarioId AND revogado_em IS NULL;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            TokenId = tokenId, UsuarioId = usuarioId, Agora = agora.ToUniversalTime(),
        }, cancellationToken: cancellationToken)) == 1;
    }

    public async Task<Guid?> ValidarAsync(string hashSha256, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        // Um UPDATE só: valida e marca o uso (se faz mais de 1 minuto), sem uma escrita por evento
        const string sql = """
            WITH alvo AS (
                SELECT token_id, usuario_id FROM tokens_ingestao
                 WHERE hash_sha256 = @Hash AND revogado_em IS NULL
            ), marcado AS (
                UPDATE tokens_ingestao t SET ultimo_uso_em = @Agora
                  FROM alvo
                 WHERE t.token_id = alvo.token_id AND (t.ultimo_uso_em IS NULL OR t.ultimo_uso_em < @Agora - INTERVAL '1 minute')
            )
            SELECT usuario_id FROM alvo;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<Guid?>(new CommandDefinition(sql, new
        {
            Hash = hashSha256, Agora = agora.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }
}
