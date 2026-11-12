namespace AgentDesk.SharedKernel.Contratos;

/// <summary>Um usuário como os outros módulos podem ver. O e-mail só serve a telas de ADMIN (ex.: escolher quem recebe um aviso).</summary>
public sealed record UsuarioResumo(Guid UsuarioId, string Nome, string Email, bool EhAdmin);

/// <summary>Implementado pelo módulo Contas: nomes para telas de ADMIN (ex.: consumo de "Todos") sem outro módulo ler a tabela usuarios.</summary>
public interface IDiretorioUsuarios
{
    Task<IReadOnlyDictionary<Guid, string>> NomesAsync(IReadOnlyCollection<Guid> usuarioIds, CancellationToken cancellationToken);

    /// <summary>Todos os usuários, por nome. Use só em rotas de ADMIN: traz o e-mail.</summary>
    Task<IReadOnlyList<UsuarioResumo>> ListarAsync(CancellationToken cancellationToken);
}
