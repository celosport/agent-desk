namespace AgentDesk.SharedKernel.Contratos;

// Contratos entre módulos (um módulo nunca referencia outro): o dono implementa, quem precisa injeta a interface.

/// <summary>Tokens de uma chamada, como vêm no campo <c>usage</c> da resposta da Anthropic.</summary>
public sealed record UsoTokens(int Entrada, int Saida, int CacheLeitura, int CacheEscrita)
{
    public static readonly UsoTokens Zero = new(0, 0, 0, 0);

    public int Total => Entrada + Saida + CacheLeitura + CacheEscrita;
}

/// <summary>
/// JSON/banco: "SUCESSO", "ERRO", "RECUSADA" (stop_reason "refusal": não é erro HTTP, mas não há resposta útil),
/// "CANCELADA" (o usuário cancelou a tarefa antes de a resposta chegar).
/// </summary>
public enum StatusChamada
{
    Sucesso,
    Erro,
    Recusada,
    Cancelada,
}

/// <summary>Uma chamada à API da Claude, já com o custo calculado e o preço da época (congelado). [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]</summary>
public sealed record ChamadaClaude(
    Guid ChamadaId,
    Guid UsuarioId,
    Guid? AutomacaoId,
    string? AutomacaoNome,
    string ModeloId,
    string? ModeloUsado,
    UsoTokens Uso,
    PrecoModelo? Preco,
    decimal CustoUsd,
    int DuracaoMs,
    StatusChamada Status,
    string? ErroCodigo,
    string? MotivoParada,
    string? NomeArquivo,
    string? Resultado,
    DateTimeOffset IniciadaEm);

/// <summary>Implementado pelo módulo Consumo (dono da tabela <c>consumo_chamadas</c>).</summary>
public interface IRegistroConsumo
{
    Task RegistrarAsync(ChamadaClaude chamada, CancellationToken cancellationToken);

    /// <summary>Soma do custo do usuário em [de, ate) — usado pelo limite mensal.</summary>
    Task<decimal> GastoNoPeriodoAsync(Guid usuarioId, DateTimeOffset de, DateTimeOffset ate, CancellationToken cancellationToken);
}
