using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Modelos.ListarModelos;

/// <summary>Tabela de modelos e preços (todos os perfis leem; inativos vêm marcados para o ADMIN reativar).</summary>
public sealed record ListarModelosQuery : IQuery<IReadOnlyList<ModeloDto>>;

internal sealed class ListarModelosHandler(IModelosRepository repository) : IQueryHandler<ListarModelosQuery, IReadOnlyList<ModeloDto>>
{
    public async Task<Result<IReadOnlyList<ModeloDto>>> Handle(ListarModelosQuery query, CancellationToken cancellationToken)
    {
        var lista = await repository.ListarAsync(cancellationToken);
        return Result.Success<IReadOnlyList<ModeloDto>>(lista.Select(ModeloDto.De).ToList());
    }
}
