using AgentDesk.Modules.Tarefas.Application.DTOs;
using AgentDesk.Modules.Tarefas.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Tarefas.Application.Tarefas.ConcluirTarefa;

public sealed record ConcluirTarefaCommand(Guid UsuarioId, Guid TarefaId) : ICommand<TarefaDto>;

internal sealed class ConcluirTarefaHandler(ITarefasRepository repository, TimeProvider clock)
    : ICommandHandler<ConcluirTarefaCommand, TarefaDto>
{
    public async Task<Result<TarefaDto>> Handle(ConcluirTarefaCommand command, CancellationToken cancellationToken)
    {
        // Tarefa de outro usuário = "não encontrada" (nunca revela que existe)
        var tarefa = await repository.ObterAsync(command.UsuarioId, command.TarefaId, cancellationToken);
        if (tarefa is null) return TarefaErros.NaoEncontrada;
        if (tarefa.Status == StatusTarefa.Concluida) return TarefaErros.JaConcluida;

        var agora = clock.GetUtcNow();
        if (!await repository.ConcluirAsync(command.UsuarioId, command.TarefaId, agora, cancellationToken))
            return TarefaErros.JaConcluida;

        return TarefaDto.De(tarefa with { Status = StatusTarefa.Concluida, ConcluidaEm = agora });
    }
}
