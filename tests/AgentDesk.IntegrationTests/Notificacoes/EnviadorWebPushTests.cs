using System.Net;
using System.Security.Cryptography;
using AgentDesk.Modules.Notificacoes.Domain;
using AgentDesk.Modules.Notificacoes.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;

namespace AgentDesk.IntegrationTests.Notificacoes;

/// <summary>
/// O envio real (criptografia do conteúdo + VAPID) contra um serviço de push falso em memória: confere o que sai pela rede, sem
/// falar com o Google, a Mozilla ou a Apple. O resto dos testes troca o envio inteiro pelo <c>PushFalso</c>.
/// </summary>
public sealed class EnviadorWebPushTests
{
    private sealed class ServicoDePushFalso(HttpStatusCode resposta) : HttpMessageHandler
    {
        public HttpRequestMessage? Pedido { get; private set; }
        public int TamanhoDoCorpo { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Pedido = request;
            TamanhoDoCorpo = request.Content is null ? 0 : (await request.Content.ReadAsByteArrayAsync(cancellationToken)).Length;
            return new HttpResponseMessage(resposta);
        }
    }

    private sealed class Fabrica(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    /// <summary>Um aparelho de verdade: o par de chaves P-256 e o segredo de autenticação que o navegador criaria.</summary>
    private static Dispositivo NovoAparelho()
    {
        using var navegador = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var p = navegador.ExportParameters(false);
        var publica = new byte[65];
        publica[0] = 0x04;
        p.Q.X!.CopyTo(publica, 1);
        p.Q.Y!.CopyTo(publica, 33);
        return new Dispositivo(Guid.NewGuid(), Guid.NewGuid(), "https://fcm.googleapis.com/fcm/send/abc", ChavesVapid.Base64Url(publica),
            ChavesVapid.Base64Url(RandomNumberGenerator.GetBytes(16)), "Celular", DateTimeOffset.UtcNow);
    }

    private static Task<ResultadoEnvio> EnviarAsync(HttpStatusCode resposta, out ServicoDePushFalso servico)
    {
        servico = new ServicoDePushFalso(resposta);
        var enviador = new EnviadorWebPush(new Fabrica(servico), NullLogger<EnviadorWebPush>.Instance);
        return enviador.EnviarAsync(NovoAparelho(), ChavesVapid.Gerar(), "mailto:admin@example.com", """{"notification":{"title":"oi"}}""", CancellationToken.None);
    }

    [Fact]
    public async Task Manda_o_conteudo_criptografado_com_a_assinatura_VAPID_e_urgencia_alta()
    {
        var resultado = await EnviarAsync(HttpStatusCode.Created, out var servico);

        Assert.Equal(ResultadoEnvio.Entregue, resultado);
        var pedido = servico.Pedido!;
        Assert.Equal(HttpMethod.Post, pedido.Method);
        Assert.Equal("https://fcm.googleapis.com/fcm/send/abc", pedido.RequestUri!.ToString());
        Assert.StartsWith("vapid t=", pedido.Headers.Authorization!.ToString());
        Assert.Contains("aes128gcm", pedido.Content!.Headers.ContentEncoding);
        Assert.Contains("high", pedido.Headers.GetValues("Urgency"));
        Assert.True(servico.TamanhoDoCorpo > 80); // o conteúdo vai cifrado (cabeçalho do aes128gcm + texto + tag), não em texto puro
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.Gone)]
    public async Task Aparelho_que_o_servico_diz_que_nao_existe_mais_e_marcado_para_apagar(HttpStatusCode status)
    {
        Assert.Equal(ResultadoEnvio.DispositivoInvalido, await EnviarAsync(status, out _));
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.BadRequest)]
    public async Task Outras_recusas_sao_falha_passageira_e_nao_apagam_o_aparelho(HttpStatusCode status)
    {
        Assert.Equal(ResultadoEnvio.Falhou, await EnviarAsync(status, out _));
    }
}
