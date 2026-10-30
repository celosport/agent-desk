namespace AgentDesk.SharedKernel.Identidade;

/// <summary>Perfis da tabela usuarios (tipo_perfil). Em JSON/claims: "USUARIO", "ADMIN". Acrescente os do seu domínio.</summary>
public enum PerfilUsuario
{
    Usuario,
    Admin,
}

/// <summary>Nomes de perfil para [Authorize(Roles = ...)].</summary>
public static class Perfis
{
    public const string Usuario = "USUARIO";
    public const string Admin = "ADMIN";
}

/// <summary>Nomes das claims emitidas no JWT.</summary>
public static class ClaimsAgentDesk
{
    public const string UsuarioId = "sub";
    public const string Nome = "name";
    public const string Email = "email";
    public const string Perfil = "role";
}

/// <summary>Usuário autenticado da requisição atual (vem do JWT — nunca do body).</summary>
public interface IUsuarioAtual
{
    bool Autenticado { get; }

    /// <exception cref="InvalidOperationException">Se a requisição não estiver autenticada.</exception>
    Guid UsuarioId { get; }

    /// <exception cref="InvalidOperationException">Se a requisição não estiver autenticada.</exception>
    PerfilUsuario Perfil { get; }
}

/// <summary>Token de acesso emitido no login.</summary>
public sealed record TokenAcesso(string AccessToken, DateTimeOffset ExpiraEm);

/// <summary>Emissão de JWT. Implementado em AgentDesk.Infrastructure; os módulos só conhecem este contrato.</summary>
public interface IGeradorToken
{
    TokenAcesso Gerar(Guid usuarioId, string nome, string email, PerfilUsuario perfil);
}

/// <summary>Nomes das políticas de rate limiting registradas no Host.</summary>
public static class PoliticasRateLimit
{
    public const string Autenticacao = "autenticacao";
}
