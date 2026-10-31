namespace AgentDesk.Modules.Sessoes.Domain;

/// <summary>Uso do Claude Code somado em algum recorte (dia, projeto, modelo…). O custo é o equivalente na API.</summary>
internal sealed record UsoCc(long Pedidos, long Entrada, long Saida, long CacheLeitura, long CacheEscrita, decimal CustoUsd)
{
    public static readonly UsoCc Zero = new(0, 0, 0, 0, 0, 0m);

    public long Tokens => Entrada + Saida + CacheLeitura + CacheEscrita;

    /// <summary>
    /// Quanto do contexto lido foi reaproveitado do cache: leitura ÷ (entrada + leitura + escrita), de 0 a 1. Nulo se não houve contexto.
    /// Cache baixo é o maior desperdício de tokens (o contexto é reenviado inteiro a cada pedido).
    /// </summary>
    public decimal? TaxaCache
    {
        get
        {
            var contexto = Entrada + CacheLeitura + CacheEscrita;
            return contexto == 0 ? null : Math.Round((decimal)CacheLeitura / contexto, 3);
        }
    }

    /// <summary>Destaque de "cache baixo": poucos pedidos não dizem nada, então só vale com amostra mínima.</summary>
    public bool CacheBaixo => Pedidos >= RegrasCache.PedidosMinimos && TaxaCache is { } t && t < RegrasCache.TaxaMinima;
}

internal static class RegrasCache
{
    public const decimal TaxaMinima = 0.6m;
    public const int PedidosMinimos = 5;
}

internal sealed record UsoDia(DateOnly Dia, UsoCc Uso);

/// <summary>Uso por nome (projeto ou modelo).</summary>
internal sealed record UsoNomeado(string Nome, UsoCc Uso);

internal sealed record UsoFerramenta(string Ferramenta, long Usos);

/// <summary>Leituras do painel do Claude Code. <c>usuarioId</c> nulo = todos os usuários (escopo TODOS, só ADMIN).</summary>
internal interface ISessoesConsultas
{
    /// <summary>Soma em [de, ate] (dias de Brasília, inclusive); de nulo = desde sempre.</summary>
    Task<UsoCc> TotaisAsync(Guid? usuarioId, DateOnly? de, DateOnly? ate, CancellationToken cancellationToken);

    Task<IReadOnlyList<UsoDia>> PorDiaAsync(Guid? usuarioId, DateOnly de, DateOnly ate, CancellationToken cancellationToken);

    Task<IReadOnlyList<UsoNomeado>> PorProjetoAsync(Guid? usuarioId, DateOnly de, DateOnly ate, CancellationToken cancellationToken);

    Task<IReadOnlyList<UsoNomeado>> PorModeloAsync(Guid? usuarioId, DateOnly de, DateOnly ate, CancellationToken cancellationToken);

    /// <summary>Ferramentas mais usadas (contagem de PreToolUse na linha do tempo, que guarda 90 dias).</summary>
    Task<IReadOnlyList<UsoFerramenta>> FerramentasAsync(Guid? usuarioId, DateTimeOffset de, DateTimeOffset ate, int limite,
        CancellationToken cancellationToken);
}
