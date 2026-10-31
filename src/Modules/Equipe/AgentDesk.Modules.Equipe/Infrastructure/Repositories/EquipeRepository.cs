using Dapper;
using AgentDesk.Modules.Equipe.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Equipe.Infrastructure.Repositories;

/// <summary>Tabela <c>agentes_personalizados</c>. Tudo filtrado pelo dono (<c>usuario_id</c>).</summary>
internal sealed class EquipeRepository(IDbConnectionFactory connectionFactory) : IEquipeRepository
{
    private sealed class Linha
    {
        public Guid AgenteId { get; set; }
        public Guid UsuarioId { get; set; }
        public string Alvo { get; set; } = string.Empty;
        public string Chave { get; set; } = string.Empty;
        public short Ordem { get; set; }
        public string Nome { get; set; } = string.Empty;
        public string CorCabeca { get; set; } = string.Empty;
        public string CorCorpo { get; set; } = string.Empty;
        public string CorDetalhe { get; set; } = string.Empty;
        public string CorOlhos { get; set; } = string.Empty;
        public string Acessorio { get; set; } = string.Empty;
        public string Antena { get; set; } = string.Empty;
        public string Expressao { get; set; } = string.Empty;
        public DateTimeOffset AtualizadoEm { get; set; }

        public AgentePersonalizado ParaDominio() => new(AgenteId, UsuarioId, Alvo, Chave, Ordem, Nome, CorCabeca, CorCorpo, CorDetalhe,
            CorOlhos, Acessorio, Antena, Expressao, AtualizadoEm);
    }

    private const string Colunas = """
        agente_id, usuario_id, alvo, chave, ordem, nome, cor_cabeca, cor_corpo, cor_detalhe, cor_olhos, acessorio, antena, expressao, atualizado_em
        """;

    public async Task<IReadOnlyList<AgentePersonalizado>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM agentes_personalizados WHERE usuario_id = @UsuarioId ORDER BY alvo, chave, ordem;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<AgentePersonalizado> SalvarAsync(AgentePersonalizado a, CancellationToken cancellationToken)
    {
        const string sql = $"""
            INSERT INTO agentes_personalizados (agente_id, usuario_id, alvo, chave, ordem, nome, cor_cabeca, cor_corpo, cor_detalhe,
                                                cor_olhos, acessorio, antena, expressao, atualizado_em)
            VALUES (@AgenteId, @UsuarioId, @Alvo, @Chave, @Ordem, @Nome, @CorCabeca, @CorCorpo, @CorDetalhe,
                    @CorOlhos, @Acessorio, @Antena, @Expressao, @AtualizadoEm)
            ON CONFLICT (usuario_id, alvo, chave, ordem) DO UPDATE
               SET nome = EXCLUDED.nome, cor_cabeca = EXCLUDED.cor_cabeca, cor_corpo = EXCLUDED.cor_corpo, cor_detalhe = EXCLUDED.cor_detalhe,
                   cor_olhos = EXCLUDED.cor_olhos, acessorio = EXCLUDED.acessorio, antena = EXCLUDED.antena,
                   expressao = EXCLUDED.expressao, atualizado_em = EXCLUDED.atualizado_em
            RETURNING {Colunas};
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleAsync<Linha>(new CommandDefinition(sql, new
        {
            a.AgenteId, a.UsuarioId, a.Alvo, a.Chave, Ordem = (short)a.Ordem, a.Nome, a.CorCabeca, a.CorCorpo, a.CorDetalhe, a.CorOlhos,
            a.Acessorio, a.Antena, a.Expressao, AtualizadoEm = a.AtualizadoEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
        return linha.ParaDominio();
    }

    public async Task<bool> RemoverAsync(Guid usuarioId, string alvo, string chave, int ordem, CancellationToken cancellationToken)
    {
        const string sql = """
            DELETE FROM agentes_personalizados
             WHERE usuario_id = @UsuarioId AND alvo = @Alvo AND chave = @Chave AND ordem = @Ordem;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, Alvo = alvo, Chave = chave, Ordem = (short)ordem }, cancellationToken: cancellationToken)) > 0;
    }
}
