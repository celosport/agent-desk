using Dapper;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Configuracoes.Infrastructure.Repositories;

/// <summary>Uma linha por usuário em <c>configuracoes_usuario</c>, criada no primeiro "salvar" (upsert).</summary>
internal sealed class ConfiguracoesRepository(IDbConnectionFactory connectionFactory) : IConfiguracoesRepository
{
    private sealed class Linha
    {
        public Guid UsuarioId { get; set; }
        public string? ChaveApiCifrada { get; set; }
        public string? ChaveApiFinal { get; set; }
        public string? ModeloPadraoId { get; set; }
        public decimal? LimiteMensalUsd { get; set; }
        public bool BloquearAoAtingirLimite { get; set; }

        public ConfiguracaoUsuario ParaDominio() =>
            new(UsuarioId, ChaveApiCifrada, ChaveApiFinal, ModeloPadraoId, LimiteMensalUsd, BloquearAoAtingirLimite);
    }

    public async Task<ConfiguracaoUsuario?> ObterAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT usuario_id, chave_api_cifrada, chave_api_final, modelo_padrao_id, limite_mensal_usd, bloquear_ao_atingir_limite
              FROM configuracoes_usuario
             WHERE usuario_id = @UsuarioId;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(
            sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linha?.ParaDominio();
    }

    public async Task SalvarChaveAsync(Guid usuarioId, string? chaveCifrada, string? chaveFinal, DateTimeOffset agora,
        CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO configuracoes_usuario (usuario_id, chave_api_cifrada, chave_api_final, atualizado_em)
            VALUES (@UsuarioId, @ChaveCifrada, @ChaveFinal, @Agora)
            ON CONFLICT (usuario_id) DO UPDATE
               SET chave_api_cifrada = EXCLUDED.chave_api_cifrada,
                   chave_api_final   = EXCLUDED.chave_api_final,
                   atualizado_em     = EXCLUDED.atualizado_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, ChaveCifrada = chaveCifrada, ChaveFinal = chaveFinal, Agora = agora.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }

    public async Task SalvarPreferenciasAsync(Guid usuarioId, string? modeloPadraoId, decimal? limiteMensalUsd, bool bloquear,
        DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO configuracoes_usuario (usuario_id, modelo_padrao_id, limite_mensal_usd, bloquear_ao_atingir_limite, atualizado_em)
            VALUES (@UsuarioId, @ModeloPadraoId, @LimiteMensalUsd, @Bloquear, @Agora)
            ON CONFLICT (usuario_id) DO UPDATE
               SET modelo_padrao_id           = EXCLUDED.modelo_padrao_id,
                   limite_mensal_usd          = EXCLUDED.limite_mensal_usd,
                   bloquear_ao_atingir_limite = EXCLUDED.bloquear_ao_atingir_limite,
                   atualizado_em              = EXCLUDED.atualizado_em;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, ModeloPadraoId = modeloPadraoId, LimiteMensalUsd = limiteMensalUsd, Bloquear = bloquear,
            Agora = agora.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }
}
