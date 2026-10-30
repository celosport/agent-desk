using AgentDesk.Modules.Automacoes.Application.DTOs;
using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Automacoes.Application.Automacoes.ListarAutomacoes;

/// <summary>Automações na ordem da tela. Inativas só aparecem para o ADMIN (para reativar).</summary>
public sealed record ListarAutomacoesQuery(bool IncluirInativas) : IQuery<IReadOnlyList<AutomacaoDto>>;

internal sealed class ListarAutomacoesHandler(IAutomacoesRepository repository) : IQueryHandler<ListarAutomacoesQuery, IReadOnlyList<AutomacaoDto>>
{
    public async Task<Result<IReadOnlyList<AutomacaoDto>>> Handle(ListarAutomacoesQuery query, CancellationToken cancellationToken)
    {
        var lista = await repository.ListarAsync(query.IncluirInativas, cancellationToken);
        return Result.Success<IReadOnlyList<AutomacaoDto>>(lista.Select(AutomacaoDto.De).ToList());
    }
}
