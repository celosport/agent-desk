namespace AgentDesk.Infrastructure.Auth;

/// <summary>Seção "Jwt" do appsettings. A ChaveSecreta NUNCA vai para o appsettings.json versionado (user-secrets / variável de ambiente).</summary>
public sealed class JwtOptions
{
    public const string Secao = "Jwt";
    public const int TamanhoMinimoChaveBytes = 32; // HS256 exige ≥ 256 bits

    public string Issuer { get; init; } = "agentdesk-api";
    public string Audience { get; init; } = "agentdesk-app";
    public string ChaveSecreta { get; init; } = string.Empty;
    public int ExpiracaoMinutos { get; init; } = 480; // 8h
}
