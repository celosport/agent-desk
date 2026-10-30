using AgentDesk.Modules.Configuracoes.Domain;

namespace AgentDesk.Modules.Configuracoes.Application.DTOs;

// Contratos JSON do módulo. A API key NUNCA aparece em um DTO de saída: só "configurada" e a versão mascarada.

public sealed record ConfiguracaoDto(
    bool ChaveApiConfigurada,
    string? ChaveApiMascarada,
    string? ModeloPadraoId,
    decimal? LimiteMensalUsd,
    bool BloquearAoAtingirLimite)
{
    public const string PrefixoMascara = "sk-ant-...";

    /// <param name="chaveLegivel">False quando a chave salva não decifra mais: a tela pede para cadastrar de novo.</param>
    internal static ConfiguracaoDto De(ConfiguracaoUsuario c, bool chaveLegivel) => new(
        chaveLegivel,
        chaveLegivel ? PrefixoMascara + c.ChaveApiFinal : null,
        c.ModeloPadraoId,
        c.LimiteMensalUsd,
        c.BloquearAoAtingirLimite);
}

public sealed record TesteChaveDto(bool Valida, DateTimeOffset TestadaEm);

public sealed record SalvarChaveApiRequestDto(string? ChaveApi);

public sealed record SalvarPreferenciasRequestDto(string? ModeloPadraoId, decimal? LimiteMensalUsd, bool? BloquearAoAtingirLimite);

public sealed record ModeloDto(
    string ModeloId,
    string NomeExibicao,
    decimal PrecoEntradaMTok,
    decimal PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok,
    bool Ativo,
    bool FallbackRecusa,
    DateTimeOffset AtualizadoEm)
{
    internal static ModeloDto De(ModeloClaude m) => new(m.ModeloId, m.NomeExibicao, m.PrecoEntradaMTok, m.PrecoSaidaMTok,
        m.PrecoCacheLeituraMTok, m.PrecoCacheEscritaMTok, m.Ativo, m.FallbackRecusa, m.AtualizadoEm);
}

public sealed record CriarModeloRequestDto(
    string? ModeloId,
    string? NomeExibicao,
    decimal? PrecoEntradaMTok,
    decimal? PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok,
    bool? FallbackRecusa);

public sealed record AtualizarModeloRequestDto(
    string? NomeExibicao,
    decimal? PrecoEntradaMTok,
    decimal? PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok,
    bool? Ativo,
    bool? FallbackRecusa);
