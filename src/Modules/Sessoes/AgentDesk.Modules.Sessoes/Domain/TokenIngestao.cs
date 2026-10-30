using System.Security.Cryptography;
using System.Text;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Sessoes.Domain;

/// <summary>
/// Token que o coletor do PC manda no header <c>X-AgentDesk-Token</c>. Só o hash fica no banco; o token aparece uma vez na tela.
/// Revogado = para de aceitar eventos na hora. [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
/// </summary>
internal sealed record TokenIngestao(
    Guid TokenId,
    Guid UsuarioId,
    string Nome,
    string Prefixo,
    string HashSha256,
    DateTimeOffset CriadoEm,
    DateTimeOffset? UltimoUsoEm,
    DateTimeOffset? RevogadoEm)
{
    public const string Inicio = "adk_";

    /// <summary>Token novo: "adk_" + 32 bytes aleatórios (base64url, 43 caracteres).</summary>
    public static string GerarSegredo()
        => Inicio + Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string Hash(string segredo) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(segredo))).ToLowerInvariant();

    /// <summary>"adk_3f9a1b2c" — o bastante para reconhecer na lista, inútil para usar.</summary>
    public static string PrefixoDe(string segredo) => segredo[..Math.Min(12, segredo.Length)];
}

internal static class SessaoErros
{
    public static readonly Error TokenNaoEncontrado = Error.NotFound("Sessoes.TokenNaoEncontrado", "Token não encontrado.");
    public static readonly Error SessaoNaoEncontrada = Error.NotFound("Sessoes.SessaoNaoEncontrada", "Sessão não encontrada.");

    public static readonly Error TokenInvalido = Error.Unauthorized(
        "Sessoes.TokenInvalido", "Token de ingestão inválido ou revogado. Gere outro em Configurações → Claude Code.");

    public static readonly Error LimiteDeTokens = Error.Conflict(
        "Sessoes.LimiteDeTokens", "Você já tem 10 tokens ativos. Revogue um que não use mais.");
}

internal interface ITokensRepository
{
    Task InserirAsync(TokenIngestao token, CancellationToken cancellationToken);
    Task<IReadOnlyList<TokenIngestao>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken);
    Task<int> ContarAtivosAsync(Guid usuarioId, CancellationToken cancellationToken);

    /// <summary>False se não existe, é de outro usuário ou já estava revogado.</summary>
    Task<bool> RevogarAsync(Guid usuarioId, Guid tokenId, DateTimeOffset agora, CancellationToken cancellationToken);

    /// <summary>Dono do token ativo com este hash (null = inválido ou revogado). Atualiza o "último uso" no máximo 1 vez por minuto.</summary>
    Task<Guid?> ValidarAsync(string hashSha256, DateTimeOffset agora, CancellationToken cancellationToken);
}
