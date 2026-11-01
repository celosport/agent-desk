using System.Collections.Concurrent;
using System.Text.Json;
using AgentDesk.Modules.Notificacoes.Domain;

namespace AgentDesk.IntegrationTests.Infraestrutura;

/// <summary>
/// Serviço de push falso: nenhum teste fala com o Google, a Mozilla ou a Apple. Guarda o que seria enviado, por endereço do aparelho
/// (cada teste usa endereços próprios, então não há interferência). Para simular um aparelho que sumiu, use <see cref="Responder"/>.
/// </summary>
internal sealed class PushFalso : IEnviadorPush
{
    public sealed record Envio(string Endpoint, string Json)
    {
        private JsonElement Notificacao => JsonDocument.Parse(Json).RootElement.GetProperty("notification");
        public string Titulo => Notificacao.GetProperty("title").GetString()!;
        public string Corpo => Notificacao.GetProperty("body").GetString()!;
        public string Tag => Notificacao.GetProperty("tag").GetString()!;
    }

    private readonly ConcurrentQueue<Envio> _envios = new();
    private readonly ConcurrentDictionary<string, ResultadoEnvio> _respostas = new();

    public IReadOnlyList<Envio> Enviados(string endpoint) => _envios.Where(e => e.Endpoint == endpoint).ToList();

    public void Responder(string endpoint, ResultadoEnvio resultado) => _respostas[endpoint] = resultado;

    /// <summary>Endereço único no formato de um serviço de push real (o servidor só aceita os conhecidos).</summary>
    public static string NovoEndpoint() => $"https://fcm.googleapis.com/fcm/send/{Guid.NewGuid():N}";

    public Task<ResultadoEnvio> EnviarAsync(Dispositivo dispositivo, ChavesVapid chaves, string assunto, string conteudoJson, CancellationToken cancellationToken)
    {
        _envios.Enqueue(new Envio(dispositivo.Endpoint, conteudoJson));
        return Task.FromResult(_respostas.GetValueOrDefault(dispositivo.Endpoint, ResultadoEnvio.Entregue));
    }
}
