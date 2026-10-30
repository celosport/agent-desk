using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Automacoes.Application.DTOs;

// Contratos JSON do módulo. A entrada do usuário NÃO volta (nem é guardada); o resultado sim.

public sealed record AutomacaoDto(
    Guid AutomacaoId,
    string Codigo,
    string Nome,
    string Descricao,
    string PromptSistema,
    string ModeloMensagem,
    string? ModeloId,
    int MaxTokens,
    bool Ativa)
{
    internal static AutomacaoDto De(Automacao a) =>
        new(a.AutomacaoId, a.Codigo, a.Nome, a.Descricao, a.PromptSistema, a.ModeloMensagem, a.ModeloId, a.MaxTokens, a.Ativa);
}

public sealed record AtualizarAutomacaoRequestDto(
    string? Nome,
    string? Descricao,
    string? PromptSistema,
    string? ModeloMensagem,
    string? ModeloId,
    int? MaxTokens,
    bool? Ativa);

/// <param name="ModeloId">Opcional: sobrepõe o modelo da automação só nesta execução.</param>
/// <param name="NomeArquivo">Nome do .txt/.md de onde veio a entrada (só para o histórico; o arquivo não é guardado).</param>
public sealed record ExecutarAutomacaoRequestDto(string? Entrada, string? ModeloId, string? NomeArquivo);

public sealed record TokensDto(int Entrada, int Saida, int CacheLeitura, int CacheEscrita, int Total)
{
    internal static TokensDto De(UsoTokens u) => new(u.Entrada, u.Saida, u.CacheLeitura, u.CacheEscrita, u.Total);
}

/// <summary>Gasto do mês depois desta execução, quando passou de 80% do limite.</summary>
public sealed record AlertaLimiteDto(decimal GastoMesUsd, decimal LimiteMensalUsd, decimal Percentual, bool Atingido);

public sealed record ExecucaoDto(
    Guid ChamadaId,
    Guid AutomacaoId,
    string Codigo,
    string ModeloId,
    string ModeloUsado,
    string Resultado,
    bool Truncado,
    TokensDto Tokens,
    decimal CustoUsd,
    int DuracaoMs,
    DateTimeOffset IniciadaEm,
    AlertaLimiteDto? AlertaLimite);
