using FluentValidation;
using AgentDesk.Modules.Tarefas.Application.DTOs;
using AgentDesk.Modules.Tarefas.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Tarefas.Application.Tarefas.CriarTarefa;

// Vertical slice: Command + Validator + Handler no mesmo arquivo/pasta. O ValidationCommandHandlerDecorator roda o
// validator ANTES do handler (fail-fast → HTTP 400 com os campos).

public sealed record CriarTarefaCommand(Guid UsuarioId, string? Titulo) : ICommand<TarefaDto>;

internal sealed class CriarTarefaValidator : AbstractValidator<CriarTarefaCommand>
{
    public CriarTarefaValidator()
    {
        RuleFor(x => x.Titulo).NotEmpty().WithMessage("Informe o título.")
            .MaximumLength(120).WithMessage("O título tem no máximo 120 caracteres.");
    }
}

internal sealed class CriarTarefaHandler(ITarefasRepository repository, TimeProvider clock)
    : ICommandHandler<CriarTarefaCommand, TarefaDto>
{
    public async Task<Result<TarefaDto>> Handle(CriarTarefaCommand command, CancellationToken cancellationToken)
    {
        var tarefa = new Tarefa(Guid.NewGuid(), command.UsuarioId, command.Titulo!.Trim(), StatusTarefa.Pendente, clock.GetUtcNow(), null);
        await repository.InserirAsync(tarefa, cancellationToken);
        return TarefaDto.De(tarefa); // conversão implícita para Result<TarefaDto>
    }
}
