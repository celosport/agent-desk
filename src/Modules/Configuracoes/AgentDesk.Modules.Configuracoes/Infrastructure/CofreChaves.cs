using System.Security.Cryptography;
using AgentDesk.Modules.Configuracoes.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging;

namespace AgentDesk.Modules.Configuracoes.Infrastructure;

/// <summary>
/// Cifra a API key com o Data Protection do ASP.NET (anel de chaves no Postgres, configurado na Infrastructure).
/// [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]]
/// </summary>
internal sealed class CofreChaves(IDataProtectionProvider provider, ILogger<CofreChaves> log) : ICofreChaves
{
    // Mudar o propósito invalida todas as chaves salvas: crie um ".v2" e migre, nunca edite este
    private const string Proposito = "AgentDesk.Configuracoes.ChaveAnthropic.v1";

    private readonly IDataProtector _protetor = provider.CreateProtector(Proposito);

    public string Cifrar(string chaveApi) => _protetor.Protect(chaveApi);

    public string? TentarDecifrar(string? chaveCifrada)
    {
        if (string.IsNullOrEmpty(chaveCifrada)) return null;
        try
        {
            return _protetor.Unprotect(chaveCifrada);
        }
        catch (CryptographicException)
        {
            // Anel de chaves apagado/trocado: a chave vira "não configurada" e o usuário cadastra de novo (coberto por teste)
            log.LogWarning("Configuracoes: API key salva não pôde ser decifrada (anel de chaves do Data Protection mudou?).");
            return null;
        }
    }
}
