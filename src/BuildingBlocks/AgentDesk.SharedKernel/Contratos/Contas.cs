namespace AgentDesk.SharedKernel.Contratos;

/// <summary>Implementado pelo módulo Contas: nomes para telas de ADMIN (ex.: consumo de "Todos") sem outro módulo ler a tabela usuarios.</summary>
public interface IDiretorioUsuarios
{
    Task<IReadOnlyDictionary<Guid, string>> NomesAsync(IReadOnlyCollection<Guid> usuarioIds, CancellationToken cancellationToken);
}
