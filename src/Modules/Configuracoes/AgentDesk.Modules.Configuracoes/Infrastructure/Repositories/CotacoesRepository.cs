using Dapper;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Configuracoes.Infrastructure.Repositories;

/// <summary>Tabela <c>cotacoes_moeda</c>: uma linha por moeda, sempre a cotação mais recente.</summary>
internal sealed class CotacoesRepository(IDbConnectionFactory connectionFactory) : ICotacoesRepository
{
    private sealed class Linha
    {
        public string Moeda { get; set; } = string.Empty;
        public decimal BrlPorUnidade { get; set; }
        public DateOnly DataCotacao { get; set; }
        public DateTimeOffset BuscadaEm { get; set; }
    }

    public async Task SalvarAsync(CotacaoBrl c, CancellationToken cancellationToken)
    {
        // Só troca por uma cotação de dia igual ou mais novo (nunca volta no tempo)
        const string sql = """
            INSERT INTO cotacoes_moeda (moeda, brl_por_unidade, data_cotacao, buscada_em)
            VALUES (@Moeda, @BrlPorUnidade, @DataCotacao, @BuscadaEm)
            ON CONFLICT (moeda) DO UPDATE SET
                brl_por_unidade = EXCLUDED.brl_por_unidade, data_cotacao = EXCLUDED.data_cotacao, buscada_em = EXCLUDED.buscada_em
            WHERE cotacoes_moeda.data_cotacao <= EXCLUDED.data_cotacao;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            c.Moeda, c.BrlPorUnidade, c.DataCotacao, BuscadaEm = c.BuscadaEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<CotacaoBrl>> ListarAsync(CancellationToken cancellationToken)
    {
        const string sql = "SELECT moeda, brl_por_unidade, data_cotacao, buscada_em FROM cotacoes_moeda ORDER BY moeda;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return linhas.Select(l => new CotacaoBrl(l.Moeda.Trim(), l.BrlPorUnidade, l.DataCotacao, l.BuscadaEm)).ToList();
    }
}
