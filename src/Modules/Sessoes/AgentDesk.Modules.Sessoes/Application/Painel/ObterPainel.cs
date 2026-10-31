using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Tempo;

namespace AgentDesk.Modules.Sessoes.Application.Painel;

/// <summary>JSON/query: "MEU" (padrão) ou "TODOS" (só ADMIN: soma de todos os usuários).</summary>
public enum EscopoSessoes
{
    Meu,
    Todos,
}

public sealed record UsoClaudeCodeDto(
    long Pedidos,
    long Tokens,
    long Entrada,
    long Saida,
    long CacheLeitura,
    long CacheEscrita,
    decimal CustoUsd,
    /// <summary>De 0 a 1 (leitura ÷ contexto); nulo se não houve contexto.</summary>
    decimal? TaxaCache,
    /// <summary>Cache abaixo de 60% com pelo menos 5 pedidos: a tela destaca.</summary>
    bool CacheBaixo)
{
    internal static UsoClaudeCodeDto De(UsoCc u) => new(u.Pedidos, u.Tokens, u.Entrada, u.Saida, u.CacheLeitura, u.CacheEscrita, u.CustoUsd,
        u.TaxaCache, u.CacheBaixo);
}

public sealed record DiaClaudeCodeDto(DateOnly Dia, UsoClaudeCodeDto Uso);

/// <summary>Projeto ou modelo, com o uso do período.</summary>
public sealed record ItemClaudeCodeDto(string Nome, UsoClaudeCodeDto Uso);

public sealed record FerramentaUsoDto(string Ferramenta, long Usos);

public sealed record PainelClaudeCodeDto(
    EscopoSessoes Escopo,
    UsoClaudeCodeDto Hoje,
    UsoClaudeCodeDto Mes,
    UsoClaudeCodeDto Acumulado,
    int Dias,
    IReadOnlyList<DiaClaudeCodeDto> Serie,
    IReadOnlyList<ItemClaudeCodeDto> Projetos,
    IReadOnlyList<ItemClaudeCodeDto> Modelos,
    /// <summary>Contagem de usos (hooks); a telemetria não informa tokens por ferramenta.</summary>
    IReadOnlyList<FerramentaUsoDto> Ferramentas,
    DateTimeOffset AtualizadoEm);

/// <param name="UsuarioId">Null = todos (escopo TODOS).</param>
public sealed record ObterPainelQuery(Guid? UsuarioId, int Dias) : IQuery<PainelClaudeCodeDto>;

internal sealed class ObterPainelHandler(ISessoesConsultas consultas, TimeProvider clock) : IQueryHandler<ObterPainelQuery, PainelClaudeCodeDto>
{
    public const int DiasPadrao = 30;
    private const int MaximoFerramentas = 10;

    public async Task<Result<PainelClaudeCodeDto>> Handle(ObterPainelQuery query, CancellationToken cancellationToken)
    {
        var dias = Math.Clamp(query.Dias, 7, 90);
        var agora = clock.GetUtcNow();
        var hoje = FusoBrasil.DataLocal(agora);
        var inicioMes = new DateOnly(hoje.Year, hoje.Month, 1);
        var primeiroDia = hoje.AddDays(-(dias - 1));

        var totalHoje = await consultas.TotaisAsync(query.UsuarioId, hoje, hoje, cancellationToken);
        var totalMes = await consultas.TotaisAsync(query.UsuarioId, inicioMes, hoje, cancellationToken);
        var acumulado = await consultas.TotaisAsync(query.UsuarioId, null, hoje, cancellationToken);
        var porDia = (await consultas.PorDiaAsync(query.UsuarioId, primeiroDia, hoje, cancellationToken)).ToDictionary(d => d.Dia);
        var projetos = await consultas.PorProjetoAsync(query.UsuarioId, primeiroDia, hoje, cancellationToken);
        var modelos = await consultas.PorModeloAsync(query.UsuarioId, primeiroDia, hoje, cancellationToken);
        var ferramentas = await consultas.FerramentasAsync(query.UsuarioId, FusoBrasil.InicioDoDia(primeiroDia),
            FusoBrasil.InicioDoDia(hoje.AddDays(1)), MaximoFerramentas, cancellationToken);

        // Todos os dias da janela, inclusive os sem uso (o gráfico não pula dias)
        var serie = Enumerable.Range(0, dias).Select(i => primeiroDia.AddDays(i))
            .Select(d => new DiaClaudeCodeDto(d, UsoClaudeCodeDto.De(porDia.TryGetValue(d, out var u) ? u.Uso : UsoCc.Zero)))
            .ToList();

        return new PainelClaudeCodeDto(query.UsuarioId is null ? EscopoSessoes.Todos : EscopoSessoes.Meu,
            UsoClaudeCodeDto.De(totalHoje), UsoClaudeCodeDto.De(totalMes), UsoClaudeCodeDto.De(acumulado), dias, serie,
            projetos.Select(p => new ItemClaudeCodeDto(p.Nome, UsoClaudeCodeDto.De(p.Uso))).ToList(),
            modelos.Select(m => new ItemClaudeCodeDto(m.Nome, UsoClaudeCodeDto.De(m.Uso))).ToList(),
            ferramentas.Select(f => new FerramentaUsoDto(f.Ferramenta, f.Usos)).ToList(), agora);
    }
}
