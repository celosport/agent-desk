using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Automacoes.Application.Automacoes.CancelarExecucao;

/// <summary>
/// Cancela uma execução em andamento do próprio usuário: interrompe a chamada à Claude e grava a chamada como CANCELADA.
/// A execução original responde com <c>Automacoes.Cancelada</c>. [[ADR-012 - Cancelar Tarefa do Agente]]
/// </summary>
public sealed record CancelarExecucaoCommand(Guid UsuarioId, Guid ExecucaoId) : ICommand<bool>;

internal sealed class CancelarExecucaoHandler(IExecucoesEmAndamento emAndamento) : ICommandHandler<CancelarExecucaoCommand, bool>
{
    public Task<Result<bool>> Handle(CancelarExecucaoCommand command, CancellationToken cancellationToken)
        => Task.FromResult(emAndamento.Cancelar(command.ExecucaoId, command.UsuarioId)
            ? Result.Success(true)
            : Result.Failure<bool>(AutomacaoErros.ExecucaoNaoEncontrada));
}
