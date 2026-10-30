using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Contas.Domain;

internal sealed record Usuario(Guid UsuarioId, string Nome, string Email, string? SenhaHash, PerfilUsuario Perfil);

internal static class ContaErros
{
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails têm conta
    public static readonly Error CredenciaisInvalidas = Error.Unauthorized("Auth.CredenciaisInvalidas", "E-mail ou senha inválidos.");
    public static readonly Error EmailEmUso = Error.Conflict("Auth.EmailEmUso", "Este e-mail já tem cadastro.");
}

internal interface IUsuariosRepository
{
    Task<Usuario?> ObterPorEmailAsync(string email, CancellationToken cancellationToken);

    /// <summary>False se o e-mail já existe (índice único em lower(email)).</summary>
    Task<bool> InserirAsync(Usuario usuario, CancellationToken cancellationToken);
}
