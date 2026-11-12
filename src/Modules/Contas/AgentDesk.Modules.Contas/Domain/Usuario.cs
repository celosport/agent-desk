using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Contas.Domain;

internal sealed record Usuario(Guid UsuarioId, string Nome, string Email, string? SenhaHash, PerfilUsuario Perfil, string? FotoVersao = null);

/// <summary>Foto de perfil já recortada pelo app (conteúdo + tipo). O arquivo tem consulta própria; o usuário só guarda a versão.</summary>
internal sealed record Foto(byte[] Bytes, string Tipo);

internal static class ContaErros
{
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails têm conta
    public static readonly Error CredenciaisInvalidas = Error.Unauthorized("Auth.CredenciaisInvalidas", "E-mail ou senha inválidos.");
    public static readonly Error EmailEmUso = Error.Conflict("Auth.EmailEmUso", "Este e-mail já tem cadastro.");
    public static readonly Error UsuarioNaoEncontrado = Error.NotFound("Conta.UsuarioNaoEncontrado", "Conta não encontrada.");
    public static readonly Error VerComoSoUsuario = Error.Forbidden("Conta.VerComoSoUsuario", "O \"Ver como\" vale só para contas de usuário (não para administradores).");
    public static readonly Error FotoInvalida = Error.Unprocessable("Conta.FotoInvalida", "A foto deve ser uma imagem PNG, JPEG ou WEBP.");
    public static readonly Error FotoGrande = Error.Unprocessable("Conta.FotoGrande", "A foto tem no máximo 1 MB.");
    public static readonly Error FotoNaoEncontrada = Error.NotFound("Conta.FotoNaoEncontrada", "Esta conta não tem foto.");
}

internal interface IUsuariosRepository
{
    Task<Usuario?> ObterPorEmailAsync(string email, CancellationToken cancellationToken);
    Task<Usuario?> ObterPorIdAsync(Guid usuarioId, CancellationToken cancellationToken);

    /// <summary>Auditoria: o ADMIN abriu o "Ver como" deste usuário.</summary>
    Task RegistrarVerComoAsync(Guid adminId, Guid usuarioId, DateTimeOffset em, CancellationToken cancellationToken);

    /// <summary>False se o e-mail já existe (índice único em lower(email)).</summary>
    Task<bool> InserirAsync(Usuario usuario, CancellationToken cancellationToken);

    Task AtualizarNomeAsync(Guid usuarioId, string nome, CancellationToken cancellationToken);
    Task<Foto?> ObterFotoAsync(Guid usuarioId, CancellationToken cancellationToken);
    Task SalvarFotoAsync(Guid usuarioId, Foto foto, string versao, CancellationToken cancellationToken);
    Task RemoverFotoAsync(Guid usuarioId, CancellationToken cancellationToken);
}
