using Dapper;
using AgentDesk.Modules.Tarefas.Domain;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Modules.Tarefas.Infrastructure.Repositories;

/// <summary>SQL explícito com Dapper. Uma conexão por operação (vem do pool); parâmetros sempre nomeados (@Param).</summary>
internal sealed class TarefasRepository(IDbConnectionFactory connectionFactory) : ITarefasRepository
{
    // Linha do banco (snake_case ↔ PascalCase pelo DapperConfig); o enum vem como texto e é convertido aqui
    private sealed class Linha
    {
        public Guid TarefaId { get; set; }
        public Guid UsuarioId { get; set; }
        public string Titulo { get; set; } = string.Empty;
        public string Status { get; set; } = "PENDENTE";
        public DateTimeOffset CriadaEm { get; set; }
        public DateTimeOffset? ConcluidaEm { get; set; }

        public Tarefa ParaDominio() => new(TarefaId, UsuarioId, Titulo, EnumTexto.Parse<StatusTarefa>(Status), CriadaEm, ConcluidaEm);
    }

    private const string Colunas = "tarefa_id, usuario_id, titulo, status, criada_em, concluida_em";

    public async Task InserirAsync(Tarefa t, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO tarefas (tarefa_id, usuario_id, titulo, status, criada_em)
            VALUES (@TarefaId, @UsuarioId, @Titulo, @Status, @CriadaEm);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            t.TarefaId, t.UsuarioId, t.Titulo, Status = t.Status.ToTexto(), t.CriadaEm,
        }, cancellationToken: cancellationToken));
    }

    public async Task<Tarefa?> ObterAsync(Guid usuarioId, Guid tarefaId, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM tarefas WHERE tarefa_id = @TarefaId AND usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(
            sql, new { TarefaId = tarefaId, UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linha?.ParaDominio();
    }

    public async Task<IReadOnlyList<Tarefa>> ListarAsync(Guid usuarioId, StatusTarefa? status, CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT {Colunas} FROM tarefas
             WHERE usuario_id = @UsuarioId AND (@Status::text IS NULL OR status = @Status)
             ORDER BY criada_em DESC;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(
            sql, new { UsuarioId = usuarioId, Status = status?.ToTexto() }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<bool> ConcluirAsync(Guid usuarioId, Guid tarefaId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = """
            UPDATE tarefas SET status = 'CONCLUIDA', concluida_em = @Agora
             WHERE tarefa_id = @TarefaId AND usuario_id = @UsuarioId AND status = 'PENDENTE';
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            TarefaId = tarefaId, UsuarioId = usuarioId, Agora = agora,
        }, cancellationToken: cancellationToken)) == 1;
    }
}
