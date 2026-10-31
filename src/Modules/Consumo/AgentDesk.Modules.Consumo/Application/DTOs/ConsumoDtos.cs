using AgentDesk.Modules.Consumo.Domain;
using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Consumo.Application.DTOs;

// Contratos JSON do módulo. Custos em US$ (estimados pela tabela de preços da época de cada chamada).

public sealed record TotaisDto(int Chamadas, long Tokens, decimal CustoUsd)
{
    internal static TotaisDto De(Totais t) => new(t.Chamadas, t.Tokens, t.CustoUsd);
}

/// <param name="Dia">Dia de Brasília ("2026-10-30").</param>
public sealed record ConsumoDiaDto(DateOnly Dia, int Chamadas, long Tokens, decimal CustoUsd);

/// <param name="AutomacaoId">Null = chamadas sem automação.</param>
public sealed record RankingAutomacaoDto(Guid? AutomacaoId, string Nome, int Chamadas, long Tokens, decimal CustoUsd);

/// <param name="Dias">Janela do gráfico e do ranking (termina hoje).</param>
/// <param name="LimiteMensalUsd">Só no escopo MEU, quando há limite.</param>
public sealed record ResumoConsumoDto(
    EscopoConsumo Escopo,
    TotaisDto Hoje,
    TotaisDto Mes,
    TotaisDto Acumulado,
    int Dias,
    IReadOnlyList<ConsumoDiaDto> PorDia,
    IReadOnlyList<RankingAutomacaoDto> Ranking,
    decimal? LimiteMensalUsd,
    decimal? PercentualLimite,
    DateTimeOffset AtualizadoEm);

public sealed record TokensDto(int Entrada, int Saida, int CacheLeitura, int CacheEscrita, int Total)
{
    internal static TokensDto De(UsoTokens u) => new(u.Entrada, u.Saida, u.CacheLeitura, u.CacheEscrita, u.Total);
}

/// <param name="UsuarioNome">Só no escopo TODOS (ADMIN).</param>
public sealed record ChamadaDto(
    Guid ChamadaId,
    DateTimeOffset IniciadaEm,
    string? UsuarioNome,
    Guid? AutomacaoId,
    string? AutomacaoNome,
    string ModeloId,
    string? ModeloUsado,
    TokensDto Tokens,
    decimal CustoUsd,
    int DuracaoMs,
    StatusChamada Status,
    string? ErroCodigo,
    string? MotivoParada,
    string? NomeArquivo,
    bool TemResultado)
{
    /// <summary>Quando terminou (início + duração).</summary>
    public DateTimeOffset FinalizadaEm => IniciadaEm.AddMilliseconds(DuracaoMs);

    internal static ChamadaDto De(Chamada c, string? usuarioNome) => new(c.ChamadaId, c.IniciadaEm, usuarioNome, c.AutomacaoId,
        c.AutomacaoNome, c.ModeloId, c.ModeloUsado, TokensDto.De(c.Uso), c.CustoUsd, c.DuracaoMs, c.Status, c.ErroCodigo,
        c.MotivoParada, c.NomeArquivo, c.TemResultado);
}

/// <summary>Uma chamada com o resultado (para reabrir) e os preços usados no cálculo do custo.</summary>
public sealed record ChamadaDetalheDto(
    ChamadaDto Chamada,
    string? Resultado,
    decimal? PrecoEntradaMTok,
    decimal? PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok);

public sealed record PaginaChamadasDto(IReadOnlyList<ChamadaDto> Itens, int Total, int Pagina, int Tamanho, TotaisDto Totais);

public sealed record AutomacaoFiltroDto(Guid AutomacaoId, string Nome);

/// <summary>Opções dos filtros do histórico: só o que aparece no consumo de quem pergunta.</summary>
public sealed record FiltrosConsumoDto(IReadOnlyList<AutomacaoFiltroDto> Automacoes, IReadOnlyList<string> Modelos);
