using AgentDesk.Modules.Equipe.Application.DTOs;
using AgentDesk.Modules.Equipe.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Equipe.Application.Agentes.ListarAgentes;

/// <summary>Todos os agentes personalizados do usuário (o Escritório usa o padrão para os que não aparecem aqui).</summary>
public sealed record ListarAgentesQuery(Guid UsuarioId) : IQuery<IReadOnlyList<AgenteDto>>;

internal sealed class ListarAgentesHandler(IEquipeRepository repository) : IQueryHandler<ListarAgentesQuery, IReadOnlyList<AgenteDto>>
{
    public async Task<Result<IReadOnlyList<AgenteDto>>> Handle(ListarAgentesQuery query, CancellationToken cancellationToken)
    {
        var lista = await repository.ListarAsync(query.UsuarioId, cancellationToken);
        return Result.Success<IReadOnlyList<AgenteDto>>(lista.Select(AgenteDto.De).ToList());
    }
}
