using AgentDesk.Modules.Equipe.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Equipe.Application.Agentes.RestaurarAgente;

/// <summary>Remove a personalização: o agente volta ao nome e à aparência padrão do Escritório. Só alcança os agentes do próprio usuário.</summary>
public sealed record RestaurarAgenteCommand(Guid UsuarioId, string Alvo, string Chave, int Ordem) : ICommand<bool>;

internal sealed class RestaurarAgenteHandler(IEquipeRepository repository) : ICommandHandler<RestaurarAgenteCommand, bool>
{
    public async Task<Result<bool>> Handle(RestaurarAgenteCommand c, CancellationToken cancellationToken)
    {
        var removido = await repository.RemoverAsync(c.UsuarioId, c.Alvo.Trim().ToUpperInvariant(), c.Chave.Trim(), c.Ordem, cancellationToken);
        return removido ? Result.Success(true) : AgenteErros.NaoEncontrado;
    }
}
