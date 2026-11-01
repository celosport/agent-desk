using System.Text.Json;
using AgentDesk.Modules.Notificacoes.Domain;
using AgentDesk.SharedKernel.Contratos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AgentDesk.Modules.Notificacoes.Application;

/// <summary>
/// Monta e manda o alerta. Respeita as preferências do usuário, junta o "ainda rodando" de quem souber informar
/// (<see cref="IResumoEmAndamento"/>) e apaga a inscrição dos aparelhos que o serviço de push disse que não existem mais.
/// Nunca lança exceção. [[ADR-016 - Alertas no Celular (Push do App)]]
/// </summary>
internal sealed class Notificador(
    INotificacoesRepository repositorio,
    IEnviadorPush enviador,
    IEnumerable<IResumoEmAndamento> resumos,
    IConfiguration configuracao,
    ILogger<Notificador> log) : INotificador
{
    /// <summary>Quantas linhas de "ainda rodando" cabem no alerta (o resto vira "+N").</summary>
    private const int MaximoDeLinhas = 3;

    /// <summary>Prazo total de um alerta (<c>Notificacoes:PrazoSegundos</c>, padrão 10 s). Os testes alargam: o banco deles é remoto.</summary>
    private TimeSpan Prazo => TimeSpan.FromSeconds(configuracao.GetValue("Notificacoes:PrazoSegundos", 10));

    public async Task NotificarAsync(Guid usuarioId, TipoAlerta tipo, string titulo, string corpo, string tag, CancellationToken cancellationToken)
    {
        // Quem chama (hook do Claude Code, automação) não pode ficar esperando um serviço de push lento
        using var limite = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        limite.CancelAfter(Prazo);
        try
        {
            var preferencias = await repositorio.ObterPreferenciasAsync(usuarioId, limite.Token);
            if (!preferencias.Aceita(tipo)) return;

            var dispositivos = await repositorio.ListarDispositivosAsync(usuarioId, limite.Token);
            if (dispositivos.Count == 0) return;

            var texto = corpo + await EmAndamentoAsync(usuarioId, limite.Token);
            await EnviarAsync(dispositivos, titulo, texto, tag, limite.Token);
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            // Falha de alerta não derruba quem chamou (automação, ingestão). O log traz só o tipo do erro.
            log.LogWarning("Notificacoes: não foi possível mandar o alerta ({Tipo}).", ex.GetType().Name);
        }
    }

    /// <summary>Manda para todos os aparelhos do usuário e devolve em quantos chegou (usado também pelo botão de teste).</summary>
    public async Task<int> EnviarAsync(IReadOnlyList<Dispositivo> dispositivos, string titulo, string corpo, string tag, CancellationToken cancellationToken)
    {
        var chaves = await repositorio.ObterOuCriarChavesAsync(ChavesVapid.Gerar, cancellationToken);
        var assunto = configuracao["Notificacoes:Assunto"] is { Length: > 0 } a ? a : "mailto:admin@example.com";
        var conteudo = Conteudo(titulo, corpo, tag);

        var entregues = 0;
        foreach (var dispositivo in dispositivos)
        {
            switch (await enviador.EnviarAsync(dispositivo, chaves, assunto, conteudo, cancellationToken))
            {
                case ResultadoEnvio.Entregue:
                    entregues++;
                    break;
                case ResultadoEnvio.DispositivoInvalido:
                    await repositorio.RemoverDispositivoPorIdAsync(dispositivo.DispositivoId, cancellationToken);
                    break;
            }
        }
        return entregues;
    }

    /// <summary>
    /// Formato que o service worker do Angular entende (<c>{ notification: ... }</c>): ele mesmo mostra o alerta e, ao tocar, abre o
    /// Escritório. A tag faz um alerta novo do mesmo assunto trocar o anterior em vez de empilhar.
    /// </summary>
    internal static string Conteudo(string titulo, string corpo, string tag) => JsonSerializer.Serialize(new
    {
        notification = new
        {
            title = titulo,
            body = corpo,
            icon = "/icons/icon-192x192.png",
            badge = "/icons/icon-192x192.png",
            tag,
            data = new { onActionClick = new { @default = new { operation = "navigateLastFocusedOrOpen", url = "/escritorio" } } },
        },
    });

    private async Task<string> EmAndamentoAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        var linhas = new List<string>();
        foreach (var resumo in resumos)
        {
            try { linhas.AddRange(await resumo.ListarAsync(usuarioId, cancellationToken)); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning("Notificacoes: um resumo de tarefas em andamento falhou ({Tipo}).", ex.GetType().Name);
            }
        }
        if (linhas.Count == 0) return "";

        var mostradas = linhas.Take(MaximoDeLinhas).ToList();
        if (linhas.Count > MaximoDeLinhas) mostradas.Add($"+{linhas.Count - MaximoDeLinhas}");
        return "\nAinda rodando: " + string.Join(" · ", mostradas);
    }
}
