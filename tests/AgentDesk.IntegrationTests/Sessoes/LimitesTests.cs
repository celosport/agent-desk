using System.Net;
using System.Net.Http.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Sessoes;

[Collection(ApiCollection.Nome)]
public sealed class LimitesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/sessoes/limites";

    private sealed record Conta(HttpClient Http, Guid Id, string Token);

    private async Task<Conta> ContaComTokenAsync()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var criado = await (await http.PostAsJsonAsync("/api/v1/sessoes/tokens", new { nome = "Notebook" })).JsonAsync();
        return new Conta(http, await AgentDeskApiFactory.IdAsync(http), criado.GetProperty("segredo").GetString()!);
    }

    private Task<HttpResponseMessage> EnviarAsync(string? token, object corpo)
    {
        var pedido = new HttpRequestMessage(HttpMethod.Post, Rota) { Content = JsonContent.Create(corpo) };
        if (token is not null) pedido.Headers.Add("X-AgentDesk-Token", token);
        return factory.CreateClient().SendAsync(pedido);
    }

    private static object Janela(decimal percentual, TimeSpan renovaEm) => new { percentual, renovaEm = DateTimeOffset.UtcNow + renovaEm };

    [Fact]
    public async Task Sem_leitura_nao_ha_janelas()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var limites = await (await usuario.GetAsync(Rota)).JsonAsync();

        Assert.False(limites.TryGetProperty("cincoHoras", out _));
        Assert.False(limites.TryGetProperty("semana", out _));
    }

    [Fact]
    public async Task Coletor_informa_as_duas_janelas_e_o_app_le()
    {
        var c = await ContaComTokenAsync();

        var resposta = await EnviarAsync(c.Token, new { cincoHoras = Janela(34.5m, TimeSpan.FromHours(3)), semana = Janela(38m, TimeSpan.FromDays(4)) });

        Assert.Equal(HttpStatusCode.Accepted, resposta.StatusCode);
        var limites = await (await c.Http.GetAsync(Rota)).JsonAsync();
        Assert.Equal(34.5m, limites.GetProperty("cincoHoras").GetProperty("percentual").GetDecimal());
        Assert.Equal(38m, limites.GetProperty("semana").GetProperty("percentual").GetDecimal());
        var renova = limites.GetProperty("cincoHoras").GetProperty("renovaEm").GetDateTimeOffset();
        Assert.InRange(renova, DateTimeOffset.UtcNow.AddHours(2.9), DateTimeOffset.UtcNow.AddHours(3.1));
        Assert.True(limites.TryGetProperty("atualizadoEm", out _));
    }

    [Fact]
    public async Task Nova_leitura_substitui_a_anterior_e_uma_janela_so_nao_apaga_a_outra()
    {
        var c = await ContaComTokenAsync();
        await EnviarAsync(c.Token, new { cincoHoras = Janela(10m, TimeSpan.FromHours(4)), semana = Janela(20m, TimeSpan.FromDays(3)) });

        await EnviarAsync(c.Token, new { cincoHoras = Janela(55m, TimeSpan.FromHours(2)) });

        var limites = await (await c.Http.GetAsync(Rota)).JsonAsync();
        Assert.Equal(55m, limites.GetProperty("cincoHoras").GetProperty("percentual").GetDecimal());
        Assert.Equal(20m, limites.GetProperty("semana").GetProperty("percentual").GetDecimal());
    }

    [Fact]
    public async Task Janela_que_ja_renovou_ou_fora_do_possivel_e_ignorada()
    {
        var c = await ContaComTokenAsync();

        Assert.Equal(HttpStatusCode.Accepted, (await EnviarAsync(c.Token, new { cincoHoras = Janela(80m, TimeSpan.FromMinutes(-5)) })).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await EnviarAsync(c.Token, new { semana = Janela(80m, TimeSpan.FromDays(30)) })).StatusCode);

        var limites = await (await c.Http.GetAsync(Rota)).JsonAsync();
        Assert.False(limites.TryGetProperty("cincoHoras", out _));
        Assert.False(limites.TryGetProperty("semana", out _));
    }

    [Fact]
    public async Task Janela_guardada_some_quando_renova()
    {
        var c = await ContaComTokenAsync();
        await EnviarAsync(c.Token, new { cincoHoras = Janela(70m, TimeSpan.FromHours(1)) });
        await factory.ExecutarAsync("UPDATE cc_limites SET renova_em = now() - interval '1 minute' WHERE usuario_id = @U", new { U = c.Id });

        var limites = await (await c.Http.GetAsync(Rota)).JsonAsync();

        Assert.False(limites.TryGetProperty("cincoHoras", out _));
    }

    [Fact]
    public async Task Token_invalido_ou_ausente_responde_401()
    {
        var corpo = new { cincoHoras = Janela(10m, TimeSpan.FromHours(1)) };

        Assert.Equal(HttpStatusCode.Unauthorized, (await EnviarAsync(null, corpo)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await EnviarAsync("adk_naoexiste", corpo)).StatusCode);
    }

    [Theory]
    [InlineData(101)]
    [InlineData(-1)]
    public async Task Percentual_fora_de_0_a_100_responde_400(int percentual)
    {
        var c = await ContaComTokenAsync();

        var resposta = await EnviarAsync(c.Token, new { cincoHoras = Janela(percentual, TimeSpan.FromHours(1)) });

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.Equal("Validacao.Falhou", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Corpo_sem_nenhuma_janela_responde_400()
    {
        var c = await ContaComTokenAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await EnviarAsync(c.Token, new { })).StatusCode);
    }

    [Fact]
    public async Task Cada_usuario_ve_so_as_proprias_janelas()
    {
        var ana = await ContaComTokenAsync();
        var bia = await factory.ClienteNovoUsuarioAsync();
        await EnviarAsync(ana.Token, new { cincoHoras = Janela(42m, TimeSpan.FromHours(1)) });

        Assert.False((await (await bia.GetAsync(Rota)).JsonAsync()).TryGetProperty("cincoHoras", out _));
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(Rota)).StatusCode);
    }
}
