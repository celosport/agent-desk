using AgentDesk.Modules.Tarefas.Application.DTOs;
using AgentDesk.Modules.Tarefas.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Tarefas.Application.Tarefas.ListarTarefas;

/// <summary>Query: só lê. Sempre filtra pelo usuário do token, nunca por um id vindo do cliente.</summary>
public sealed record ListarTarefasQuery(Guid UsuarioId, StatusTarefa? Status) : IQuery<IReadOnlyList<TarefaDto>>;

internal sealed class ListarTarefasHandler(ITarefasRepository repository)
    : IQueryHandler<ListarTarefasQuery, IReadOnlyList<TarefaDto>>
{
    public async Task<Result<IReadOnlyList<TarefaDto>>> Handle(ListarTarefasQuery query, CancellationToken cancellationToken)
    {
        var lista = await repository.ListarAsync(query.UsuarioId, query.Status, cancellationToken);
        return Result.Success<IReadOnlyList<TarefaDto>>(lista.Select(TarefaDto.De).ToList());
    }
}
