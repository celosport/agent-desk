using AgentDesk.Modules.Sessoes.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AgentDesk.Modules.Sessoes.Application.Sessoes;

/// <summary>
/// Apaga a linha do tempo (<c>cc_eventos</c>) com mais de 90 dias, uma vez por dia. Os totais por dia (<c>cc_consumo_diario</c>)
/// ficam para sempre. Desligada nos testes (<c>Sessoes__RotinaLimpezaHabilitada=false</c>); falha só vai para o log e tenta amanhã.
/// </summary>
internal sealed class LimpezaEventosRotina(IServiceScopeFactory escopos, TimeProvider clock, ILogger<LimpezaEventosRotina> log)
    : BackgroundService
{
    public static readonly TimeSpan Retencao = TimeSpan.FromDays(90);
    private static readonly TimeSpan Intervalo = TimeSpan.FromDays(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Intervalo, clock);
        do
        {
            await ExecutarUmaVezAsync(stoppingToken);
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>Uma passada (os testes chamam direto). Devolve quantos eventos saíram; -1 se falhou.</summary>
    internal async Task<int> ExecutarUmaVezAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var escopo = escopos.CreateScope();
            var sessoes = escopo.ServiceProvider.GetRequiredService<ISessoesRepository>();
            var apagados = await sessoes.LimparEventosAntesDeAsync(clock.GetUtcNow() - Retencao, cancellationToken);
            if (apagados > 0) log.LogInformation("Sessoes: {Apagados} eventos com mais de 90 dias apagados.", apagados);
            return apagados;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Uma falha (banco fora, schema atrasado) não pode derrubar a API: BackgroundService com exceção para o host
            log.LogError("Sessoes: falha na limpeza dos eventos antigos ({Tipo}: {Mensagem}). Tenta de novo amanhã.", ex.GetType().Name, ex.Message);
            return -1;
        }
    }
}
