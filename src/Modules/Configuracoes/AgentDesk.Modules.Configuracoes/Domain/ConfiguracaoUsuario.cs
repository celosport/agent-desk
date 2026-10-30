using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Domain;

/// <summary>
/// Configurações de um usuário. A API key só existe aqui cifrada (Data Protection) e com os 4 últimos caracteres em claro
/// para a tela. [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]]
/// </summary>
internal sealed record ConfiguracaoUsuario(
    Guid UsuarioId,
    string? ChaveApiCifrada,
    string? ChaveApiFinal,
    string? ModeloPadraoId,
    decimal? LimiteMensalUsd,
    bool BloquearAoAtingirLimite)
{
    /// <summary>Usuário que nunca salvou nada: sem chave, sem modelo, sem limite.</summary>
    public static ConfiguracaoUsuario Padrao(Guid usuarioId) => new(usuarioId, null, null, null, null, true);
}

internal static class ConfiguracaoErros
{
    public static readonly Error ChaveNaoConfigurada = Error.Unprocessable(
        "Configuracoes.ChaveNaoConfigurada", "Cadastre a sua API key da Anthropic antes de testar.");

    public static readonly Error ModeloInvalido = Error.Unprocessable(
        "Configuracoes.ModeloInvalido", "Escolha um modelo ativo da tabela de modelos.");
}

internal interface IConfiguracoesRepository
{
    Task<ConfiguracaoUsuario?> ObterAsync(Guid usuarioId, CancellationToken cancellationToken);
    Task SalvarChaveAsync(Guid usuarioId, string? chaveCifrada, string? chaveFinal, DateTimeOffset agora, CancellationToken cancellationToken);
    Task SalvarPreferenciasAsync(Guid usuarioId, string? modeloPadraoId, decimal? limiteMensalUsd, bool bloquear, DateTimeOffset agora,
        CancellationToken cancellationToken);
}

/// <summary>Cifra e decifra a API key. Implementação com Data Protection em Application/Configuracoes/CofreChaves.cs.</summary>
internal interface ICofreChaves
{
    string Cifrar(string chaveApi);

    /// <summary>Null se o texto não decifra (ex.: anel de chaves apagado) — a tela trata como "não configurada".</summary>
    string? TentarDecifrar(string? chaveCifrada);
}
