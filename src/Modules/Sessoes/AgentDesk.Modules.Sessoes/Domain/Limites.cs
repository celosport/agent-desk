namespace AgentDesk.Modules.Sessoes.Domain;

/// <summary>Quanto de uma janela de uso da assinatura já foi consumido (leitura da statusline do Claude Code).</summary>
internal sealed record LimiteJanela(string Janela, decimal Percentual, DateTimeOffset RenovaEm, DateTimeOffset AtualizadoEm);

internal static class Janelas
{
    public const string CincoHoras = "CINCO_HORAS";
    public const string Semana = "SEMANA";
}

internal interface ILimitesRepository
{
    /// <summary>Guarda a leitura mais nova de cada janela (uma leitura mais antiga que a guardada é ignorada).</summary>
    Task SalvarAsync(Guid usuarioId, IReadOnlyList<LimiteJanela> janelas, CancellationToken cancellationToken);

    Task<IReadOnlyList<LimiteJanela>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken);
}
