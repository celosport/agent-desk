using Dapper;
using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Automacoes.Infrastructure.Repositories;

/// <summary>Tabela <c>automacoes</c> (carga inicial no schema.sql; depois o ADMIN edita). Automação não se apaga: desativa.</summary>
internal sealed class AutomacoesRepository(IDbConnectionFactory connectionFactory) : IAutomacoesRepository
{
    private sealed class Linha
    {
        public Guid AutomacaoId { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nome { get; set; } = string.Empty;
        public string Descricao { get; set; } = string.Empty;
        public string PromptSistema { get; set; } = string.Empty;
        public string ModeloMensagem { get; set; } = string.Empty;
        public string? ModeloId { get; set; }
        public int MaxTokens { get; set; }
        public bool Ativa { get; set; }
        public int Ordem { get; set; }
        public DateTimeOffset AtualizadaEm { get; set; }

        public Automacao ParaDominio() => new(AutomacaoId, Codigo, Nome, Descricao, PromptSistema, ModeloMensagem, ModeloId, MaxTokens,
            Ativa, Ordem, AtualizadaEm);
    }

    private const string Colunas = """
        automacao_id, codigo, nome, descricao, prompt_sistema, modelo_mensagem, modelo_id, max_tokens, ativa, ordem, atualizada_em
        """;

    public async Task<IReadOnlyList<Automacao>> ListarAsync(bool incluirInativas, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM automacoes WHERE (@IncluirInativas OR ativa) ORDER BY ordem, nome;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(
            sql, new { IncluirInativas = incluirInativas }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<Automacao?> ObterAsync(Guid automacaoId, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM automacoes WHERE automacao_id = @AutomacaoId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(
            sql, new { AutomacaoId = automacaoId }, cancellationToken: cancellationToken));
        return linha?.ParaDominio();
    }

    public async Task<bool> AtualizarAsync(Automacao a, CancellationToken cancellationToken)
    {
        const string sql = """
            UPDATE automacoes
               SET nome = @Nome, descricao = @Descricao, prompt_sistema = @PromptSistema, modelo_mensagem = @ModeloMensagem,
                   modelo_id = @ModeloId, max_tokens = @MaxTokens, ativa = @Ativa, atualizada_em = @AtualizadaEm
             WHERE automacao_id = @AutomacaoId;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            a.AutomacaoId, a.Nome, a.Descricao, a.PromptSistema, a.ModeloMensagem, a.ModeloId, a.MaxTokens, a.Ativa,
            AtualizadaEm = a.AtualizadaEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken)) == 1;
    }
}
