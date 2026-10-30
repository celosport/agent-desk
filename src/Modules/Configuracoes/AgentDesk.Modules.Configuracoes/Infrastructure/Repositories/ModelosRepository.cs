using Dapper;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Configuracoes.Infrastructure.Repositories;

/// <summary>Tabela <c>modelos_claude</c>. Modelo não se apaga (o histórico de consumo aponta para ele): desativa.</summary>
internal sealed class ModelosRepository(IDbConnectionFactory connectionFactory) : IModelosRepository
{
    // Linha do banco (snake_case ↔ PascalCase pelo DapperConfig); TIMESTAMPTZ chega pelo type handler de DateTimeOffset
    private sealed class Linha
    {
        public string ModeloId { get; set; } = string.Empty;
        public string NomeExibicao { get; set; } = string.Empty;
        public decimal PrecoEntradaMtok { get; set; }
        public decimal PrecoSaidaMtok { get; set; }
        public decimal? PrecoCacheLeituraMtok { get; set; }
        public decimal? PrecoCacheEscritaMtok { get; set; }
        public bool Ativo { get; set; }
        public DateTimeOffset AtualizadoEm { get; set; }

        public ModeloClaude ParaDominio() => new(ModeloId, NomeExibicao, PrecoEntradaMtok, PrecoSaidaMtok,
            PrecoCacheLeituraMtok, PrecoCacheEscritaMtok, Ativo, AtualizadoEm);
    }

    private const string Colunas = """
        modelo_id, nome_exibicao, preco_entrada_mtok, preco_saida_mtok, preco_cache_leitura_mtok, preco_cache_escrita_mtok,
        ativo, atualizado_em
        """;

    public async Task<IReadOnlyList<ModeloClaude>> ListarAsync(CancellationToken cancellationToken)
    {
        // Ativos primeiro e, dentro deles, do mais caro (mais capaz) para o mais barato
        const string sql = $"SELECT {Colunas} FROM modelos_claude ORDER BY ativo DESC, preco_saida_mtok DESC, modelo_id;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<ModeloClaude?> ObterAsync(string modeloId, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM modelos_claude WHERE modelo_id = @ModeloId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(
            sql, new { ModeloId = modeloId }, cancellationToken: cancellationToken));
        return linha?.ParaDominio();
    }

    public async Task<bool> InserirAsync(ModeloClaude m, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO modelos_claude (modelo_id, nome_exibicao, preco_entrada_mtok, preco_saida_mtok,
                                        preco_cache_leitura_mtok, preco_cache_escrita_mtok, ativo, atualizado_em)
            VALUES (@ModeloId, @NomeExibicao, @PrecoEntradaMTok, @PrecoSaidaMTok,
                    @PrecoCacheLeituraMTok, @PrecoCacheEscritaMTok, @Ativo, @AtualizadoEm)
            ON CONFLICT (modelo_id) DO NOTHING;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, Parametros(m), cancellationToken: cancellationToken)) == 1;
    }

    public async Task<bool> AtualizarAsync(ModeloClaude m, CancellationToken cancellationToken)
    {
        const string sql = """
            UPDATE modelos_claude
               SET nome_exibicao = @NomeExibicao, preco_entrada_mtok = @PrecoEntradaMTok, preco_saida_mtok = @PrecoSaidaMTok,
                   preco_cache_leitura_mtok = @PrecoCacheLeituraMTok, preco_cache_escrita_mtok = @PrecoCacheEscritaMTok,
                   ativo = @Ativo, atualizado_em = @AtualizadoEm
             WHERE modelo_id = @ModeloId;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, Parametros(m), cancellationToken: cancellationToken)) == 1;
    }

    private static object Parametros(ModeloClaude m) => new
    {
        m.ModeloId, m.NomeExibicao, m.PrecoEntradaMTok, m.PrecoSaidaMTok, m.PrecoCacheLeituraMTok, m.PrecoCacheEscritaMTok, m.Ativo,
        AtualizadoEm = m.AtualizadoEm.ToUniversalTime(),
    };
}
