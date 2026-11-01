using System.Net;
using AgentDesk.Modules.Notificacoes.Domain;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.Extensions.Logging;

namespace AgentDesk.Modules.Notificacoes.Infrastructure;

/// <summary>Envio real pelo protocolo Web Push (criptografia do conteúdo + VAPID). Cliente HTTP nomeado, trocável nos testes.</summary>
internal sealed class EnviadorWebPush(IHttpClientFactory httpClients, ILogger<EnviadorWebPush> log) : IEnviadorPush
{
    public const string NomeDoCliente = nameof(IEnviadorPush);

    public async Task<ResultadoEnvio> EnviarAsync(Dispositivo dispositivo, ChavesVapid chaves, string assunto, string conteudoJson,
        CancellationToken cancellationToken)
    {
        var cliente = new PushServiceClient(httpClients.CreateClient(NomeDoCliente))
        {
            DefaultAuthentication = new VapidAuthentication(chaves.Publica, chaves.Privada) { Subject = assunto },
        };
        var inscricao = new PushSubscription { Endpoint = dispositivo.Endpoint };
        inscricao.SetKey(PushEncryptionKeyName.P256DH, dispositivo.P256dh);
        inscricao.SetKey(PushEncryptionKeyName.Auth, dispositivo.Auth);

        try
        {
            // Urgência alta: o alerta precisa chegar mesmo com o celular em economia de bateria
            await cliente.RequestPushMessageDeliveryAsync(inscricao, new PushMessage(conteudoJson) { Urgency = PushMessageUrgency.High }, cancellationToken);
            return ResultadoEnvio.Entregue;
        }
        catch (PushServiceClientException ex) when (ex.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return ResultadoEnvio.DispositivoInvalido;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            log.LogWarning("Notificacoes: o serviço de push recusou ou não respondeu ({Tipo}).", ex.GetType().Name);
            return ResultadoEnvio.Falhou;
        }
    }
}
