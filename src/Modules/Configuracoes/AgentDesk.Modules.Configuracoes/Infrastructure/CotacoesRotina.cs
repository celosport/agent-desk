using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Tempo;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AgentDesk.Modules.Configuracoes.Infrastructure;

/// <summary>
/// Busca as cotações (dólar, euro e libra) no Banco Central ao subir e a cada 6 horas. Falha (rede, BCB fora do ar) só vai para o log:
/// o app segue com a última cotação guardada, ou em dólar se nunca houve. Desligada nos testes (<c>Configuracoes__CotacoesRotinaHabilitada=false</c>).
/// </summary>
internal sealed class CotacoesRotina(IServiceScopeFactory escopos, TimeProvider clock, ILogger<CotacoesRotina> log) : BackgroundService
{
    private static readonly TimeSpan Intervalo = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Intervalo, clock);
        do
        {
            try
            {
                await ExecutarUmaVezAsync(stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                // Nada aqui pode derrubar o app: cotação é só um enfeite de exibição
                log.LogError(ex, "Cotações: a rodada falhou. Tenta de novo na próxima.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>Uma passada (os testes chamam direto). Devolve quantas moedas foram atualizadas.</summary>
    internal async Task<int> ExecutarUmaVezAsync(CancellationToken cancellationToken)
    {
        var atualizadas = 0;
        using var escopo = escopos.CreateScope();
        var cliente = escopo.ServiceProvider.GetRequiredService<IClienteCotacoes>();
        var repositorio = escopo.ServiceProvider.GetRequiredService<ICotacoesRepository>();
        var agora = clock.GetUtcNow();
        var hoje = FusoBrasil.DataLocal(agora);

        // Cada moeda separada: uma falha não impede as outras
        foreach (var moeda in Moedas.Buscadas)
        {
            try
            {
                if (await cliente.UltimaAsync(moeda, hoje, cancellationToken) is not { } cotacao)
                {
                    log.LogWarning("Cotações: o Banco Central não tem cotação de {Moeda} nos últimos 7 dias.", moeda);
                    continue;
                }
                await repositorio.SalvarAsync(new CotacaoBrl(moeda, cotacao.BrlPorUnidade, cotacao.Data, agora), cancellationToken);
                atualizadas++;
            }
            // O timeout do HttpClient (BCB lento) chega como TaskCanceledException, que É um OperationCanceledException: só o desligamento
            // do app (token cancelado) deve propagar. Antes, um BCB lento derrubava o app inteiro (BackgroundServiceExceptionBehavior = StopHost).
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                log.LogWarning("Cotações: falha ao buscar {Moeda} ({Tipo}: {Mensagem}). Tenta de novo na próxima rodada.", moeda, ex.GetType().Name, ex.Message);
            }
        }
        if (atualizadas > 0) log.LogInformation("Cotações: {Atualizadas} moeda(s) atualizada(s) pelo Banco Central.", atualizadas);
        return atualizadas;
    }
}
