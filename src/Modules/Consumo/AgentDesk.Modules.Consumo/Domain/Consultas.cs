using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Consumo.Domain;

/// <summary>JSON/query: "MEU" (padrão) ou "TODOS" (só ADMIN: soma de todos os usuários).</summary>
public enum EscopoConsumo
{
    Meu,
    Todos,
}

internal sealed record Totais(int Chamadas, long Tokens, decimal CustoUsd)
{
    public static readonly Totais Zero = new(0, 0, 0m);
}

internal sealed record TotalDia(DateOnly Dia, int Chamadas, long Tokens, decimal CustoUsd);

internal sealed record TotalAutomacao(Guid? AutomacaoId, string Nome, int Chamadas, long Tokens, decimal CustoUsd);

/// <summary>Uma linha do histórico. <c>Resultado</c> só vem no detalhe.</summary>
internal sealed record Chamada(
    Guid ChamadaId,
    Guid UsuarioId,
    DateTimeOffset IniciadaEm,
    Guid? AutomacaoId,
    string? AutomacaoNome,
    string ModeloId,
    string? ModeloUsado,
    UsoTokens Uso,
    decimal CustoUsd,
    int DuracaoMs,
    StatusChamada Status,
    string? ErroCodigo,
    string? MotivoParada,
    string? NomeArquivo,
    bool TemResultado,
    string? Resultado,
    decimal? PrecoEntradaMTok,
    decimal? PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok);

/// <param name="UsuarioId">Null = todos os usuários (escopo TODOS do ADMIN).</param>
/// <param name="De">Início (UTC, incluso).</param>
/// <param name="Ate">Fim (UTC, excluso).</param>
internal sealed record FiltroHistorico(
    Guid? UsuarioId,
    DateTimeOffset? De,
    DateTimeOffset? Ate,
    Guid? AutomacaoId,
    string? ModeloId,
    StatusChamada? Status,
    int Pagina,
    int Tamanho);

internal static class ConsumoErros
{
    public static readonly Error SemPermissao = Error.Forbidden("Consumo.SemPermissao", "Só administradores veem o consumo de todos.");
    public static readonly Error NaoEncontrada = Error.NotFound("Consumo.ChamadaNaoEncontrada", "Chamada não encontrada.");

    public static Error PeriodoInvalido() => new ValidationError(new Dictionary<string, string[]>
    {
        ["de"] = ["A data inicial precisa ser anterior ou igual à final."],
    });
}

/// <summary>Leituras do painel e do histórico (a gravação é o contrato IRegistroConsumo).</summary>
internal interface IConsumoConsultas
{
    /// <summary>Totais em [desde, ate) — "hoje", "este mês" ou, com <paramref name="desde"/> nulo, tudo.</summary>
    Task<Totais> TotaisAsync(Guid? usuarioId, DateTimeOffset? desde, DateTimeOffset ate, CancellationToken cancellationToken);

    /// <summary>Totais por dia local (America/Sao_Paulo) em [de, ate). Dias sem chamada não vêm.</summary>
    Task<IReadOnlyList<TotalDia>> PorDiaAsync(Guid? usuarioId, DateTimeOffset de, DateTimeOffset ate, CancellationToken cancellationToken);

    /// <summary>Automações do maior para o menor custo em [de, ate).</summary>
    Task<IReadOnlyList<TotalAutomacao>> RankingAsync(Guid? usuarioId, DateTimeOffset de, DateTimeOffset ate, CancellationToken cancellationToken);

    Task<(IReadOnlyList<Chamada> Itens, int Total, Totais Totais)> ListarAsync(FiltroHistorico filtro, CancellationToken cancellationToken);

    /// <param name="usuarioId">Null = qualquer usuário (ADMIN).</param>
    Task<Chamada?> ObterAsync(Guid chamadaId, Guid? usuarioId, CancellationToken cancellationToken);

    Task<(IReadOnlyList<(Guid AutomacaoId, string Nome)> Automacoes, IReadOnlyList<string> Modelos)> FiltrosAsync(
        Guid? usuarioId, CancellationToken cancellationToken);
}
