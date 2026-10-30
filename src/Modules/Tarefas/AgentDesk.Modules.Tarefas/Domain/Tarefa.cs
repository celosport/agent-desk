using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Tarefas.Domain;

/// <summary>JSON/banco: "PENDENTE", "CONCLUIDA".</summary>
public enum StatusTarefa
{
    Pendente,
    Concluida,
}

/// <summary>Agregado do módulo. Registro imutável: regras de negócio ficam nos handlers e aqui, nunca no controller.</summary>
internal sealed record Tarefa(Guid TarefaId, Guid UsuarioId, string Titulo, StatusTarefa Status, DateTimeOffset CriadaEm, DateTimeOffset? ConcluidaEm);

/// <summary>Erros de negócio esperados: viram HTTP pelo <c>ResultHttpExtensions</c> (nunca exceções).</summary>
internal static class TarefaErros
{
    public static readonly Error NaoEncontrada = Error.NotFound("Tarefas.NaoEncontrada", "Tarefa não encontrada.");
    public static readonly Error JaConcluida = Error.Conflict("Tarefas.JaConcluida", "Esta tarefa já foi concluída.");
}

/// <summary>Contrato do repositório (a implementação Dapper fica em Infrastructure).</summary>
internal interface ITarefasRepository
{
    Task InserirAsync(Tarefa tarefa, CancellationToken cancellationToken);
    Task<Tarefa?> ObterAsync(Guid usuarioId, Guid tarefaId, CancellationToken cancellationToken);
    Task<IReadOnlyList<Tarefa>> ListarAsync(Guid usuarioId, StatusTarefa? status, CancellationToken cancellationToken);

    /// <summary>PENDENTE → CONCLUIDA de forma condicional. False se já não estava pendente (corrida entre dois pedidos).</summary>
    Task<bool> ConcluirAsync(Guid usuarioId, Guid tarefaId, DateTimeOffset agora, CancellationToken cancellationToken);
}
