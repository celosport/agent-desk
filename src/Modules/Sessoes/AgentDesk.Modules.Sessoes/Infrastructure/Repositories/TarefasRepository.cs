using Dapper;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Modules.Sessoes.Infrastructure.Repositories;

/// <summary>Tabelas <c>cc_pastas_liberadas</c> e <c>cc_tarefas</c>. [[ADR-018 - Mandar Tarefa para o Claude Code do PC]]</summary>
internal sealed class TarefasRepository(IDbConnectionFactory connectionFactory) : ITarefasRepository
{
    private sealed class Linha
    {
        public Guid TarefaId { get; set; }
        public string Maquina { get; set; } = string.Empty;
        public string ProjetoChave { get; set; } = string.Empty;
        public string Projeto { get; set; } = string.Empty;
        public string Texto { get; set; } = string.Empty;
        public string Status { get; set; } = "PENDENTE";
        public DateTimeOffset CriadaEm { get; set; }
        public DateTimeOffset? IniciadaEm { get; set; }
        public DateTimeOffset? FinalizadaEm { get; set; }
        public string? Erro { get; set; }

        public Tarefa ParaDominio() => new(TarefaId, Maquina, ProjetoChave, Projeto, Texto, EnumTexto.Parse<StatusTarefa>(Status), CriadaEm, IniciadaEm, FinalizadaEm, Erro);
    }

    private const string Colunas = "tarefa_id, maquina, projeto_chave, projeto, texto, status, criada_em, iniciada_em, finalizada_em, erro";

    public async Task SubstituirPastasAsync(Guid usuarioId, string maquina, IReadOnlyList<PastaLiberada> pastas, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = """
            DELETE FROM cc_pastas_liberadas
             WHERE usuario_id = @UsuarioId AND maquina = @Maquina AND NOT (projeto_chave = ANY(@Chaves));

            INSERT INTO cc_pastas_liberadas (usuario_id, maquina, projeto_chave, projeto, visto_em)
            SELECT @UsuarioId, @Maquina, p.chave, p.nome, @Agora
              FROM unnest(@Chaves, @Nomes) AS p(chave, nome)
            ON CONFLICT (usuario_id, maquina, projeto_chave) DO UPDATE SET projeto = EXCLUDED.projeto, visto_em = EXCLUDED.visto_em;

            UPDATE cc_pastas_liberadas SET visto_em = @Agora WHERE usuario_id = @UsuarioId AND maquina = @Maquina;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, Maquina = maquina, Agora = agora.ToUniversalTime(),
            Chaves = pastas.Select(p => p.ProjetoChave).ToArray(), Nomes = pastas.Select(p => p.Projeto).ToArray(),
        }, cancellationToken: cancellationToken));
    }

    public async Task RegistrarSinalAsync(Guid usuarioId, string maquina, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = "UPDATE cc_pastas_liberadas SET visto_em = @Agora WHERE usuario_id = @UsuarioId AND maquina = @Maquina;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new { UsuarioId = usuarioId, Maquina = maquina, Agora = agora.ToUniversalTime() },
            cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<PastaDoComputador>> ListarPastasAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT maquina, projeto_chave AS ProjetoChave, projeto, visto_em AS VistoEm
              FROM cc_pastas_liberadas WHERE usuario_id = @UsuarioId ORDER BY maquina, projeto;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<(string Maquina, string ProjetoChave, string Projeto, DateTimeOffset VistoEm)>(
            new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linhas.Select(l => new PastaDoComputador(l.Maquina, l.ProjetoChave, l.Projeto, l.VistoEm)).ToList();
    }

    public async Task<string?> NomeDaPastaAsync(Guid usuarioId, string maquina, string projetoChave, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT projeto FROM cc_pastas_liberadas
             WHERE usuario_id = @UsuarioId AND maquina = @Maquina AND projeto_chave = @ProjetoChave;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<string>(new CommandDefinition(sql,
            new { UsuarioId = usuarioId, Maquina = maquina, ProjetoChave = projetoChave }, cancellationToken: cancellationToken));
    }

    public async Task<bool> CriarAsync(Guid usuarioId, Tarefa t, int maximoAbertas, CancellationToken cancellationToken)
    {
        // O limite é conferido no mesmo comando que grava: duas requisições juntas não passam dele
        const string sql = """
            INSERT INTO cc_tarefas (tarefa_id, usuario_id, maquina, projeto_chave, projeto, texto, status, criada_em)
            SELECT @TarefaId, @UsuarioId, @Maquina, @ProjetoChave, @Projeto, @Texto, 'PENDENTE', @CriadaEm
             WHERE (SELECT count(*) FROM cc_tarefas WHERE usuario_id = @UsuarioId AND status IN ('PENDENTE', 'EM_ANDAMENTO')) < @Maximo;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            t.TarefaId, UsuarioId = usuarioId, t.Maquina, t.ProjetoChave, t.Projeto, t.Texto, CriadaEm = t.CriadaEm.ToUniversalTime(), Maximo = maximoAbertas,
        }, cancellationToken: cancellationToken)) > 0;
    }

    public async Task<IReadOnlyList<Tarefa>> ListarAsync(Guid usuarioId, int quantas, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM cc_tarefas WHERE usuario_id = @UsuarioId ORDER BY criada_em DESC LIMIT @Quantas;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId, Quantas = quantas }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<Tarefa?> ObterAsync(Guid usuarioId, Guid tarefaId, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM cc_tarefas WHERE usuario_id = @UsuarioId AND tarefa_id = @TarefaId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId, TarefaId = tarefaId }, cancellationToken: cancellationToken));
        return linha?.ParaDominio();
    }

    public async Task<bool> CancelarPendenteAsync(Guid usuarioId, Guid tarefaId, DateTimeOffset agora, CancellationToken cancellationToken)
    {
        const string sql = """
            UPDATE cc_tarefas SET status = 'CANCELADA', finalizada_em = @Agora
             WHERE usuario_id = @UsuarioId AND tarefa_id = @TarefaId AND status = 'PENDENTE';
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new { UsuarioId = usuarioId, TarefaId = tarefaId, Agora = agora.ToUniversalTime() },
            cancellationToken: cancellationToken)) > 0;
    }

    public async Task<IReadOnlyList<Tarefa>> ReivindicarAsync(Guid usuarioId, string maquina, int limite, DateTimeOffset validasDesde, DateTimeOffset agora,
        CancellationToken cancellationToken)
    {
        // SKIP LOCKED: dois pedidos juntos do mesmo coletor não recebem a mesma tarefa
        const string sql = $"""
            UPDATE cc_tarefas SET status = 'EM_ANDAMENTO', iniciada_em = @Agora
             WHERE tarefa_id IN (SELECT tarefa_id FROM cc_tarefas
                                  WHERE usuario_id = @UsuarioId AND maquina = @Maquina AND status = 'PENDENTE' AND criada_em >= @ValidasDesde
                                  ORDER BY criada_em LIMIT @Limite FOR UPDATE SKIP LOCKED)
            RETURNING {Colunas};
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<Linha>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, Maquina = maquina, Limite = limite, ValidasDesde = validasDesde.ToUniversalTime(), Agora = agora.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).OrderBy(t => t.CriadaEm).ToList();
    }

    public async Task<bool> FinalizarAsync(Guid usuarioId, string maquina, Guid tarefaId, StatusTarefa status, string? erro, DateTimeOffset agora,
        CancellationToken cancellationToken)
    {
        const string sql = """
            UPDATE cc_tarefas SET status = @Status, finalizada_em = @Agora, erro = @Erro
             WHERE usuario_id = @UsuarioId AND maquina = @Maquina AND tarefa_id = @TarefaId AND status = 'EM_ANDAMENTO';
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, Maquina = maquina, TarefaId = tarefaId, Status = status.ToTexto(), Agora = agora.ToUniversalTime(), Erro = erro,
        }, cancellationToken: cancellationToken)) > 0;
    }
}
