using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Sessoes;

[Collection(ApiCollection.Nome)]
public sealed class ControleSessoesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/sessoes";

    private sealed record Conta(HttpClient Http, Guid Id, string Token);

    private async Task<Conta> ContaComSessaoAsync(string sessao)
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var criado = await (await http.PostAsJsonAsync($"{Rota}/tokens", new { nome = "Notebook" })).JsonAsync();
        var conta = new Conta(http, await AgentDeskApiFactory.IdAsync(http), criado.GetProperty("segredo").GetString()!);
        (await Coletor(conta.Token, HttpMethod.Post, $"{Rota}/eventos", new
        {
            sessaoId = sessao, evento = "SessionStart", maquina = "Notebook", projeto = "agent-desk", projetoChave = "a1b2c3d4e5f6",
            ocorridoEm = DateTimeOffset.UtcNow,
        })).EnsureSuccessStatusCode();
        return conta;
    }

    private Task<HttpResponseMessage> Coletor(string? token, HttpMethod metodo, string url, object? corpo = null)
    {
        var pedido = new HttpRequestMessage(metodo, url);
        if (corpo is not null) pedido.Content = JsonContent.Create(corpo);
        if (token is not null) pedido.Headers.Add("X-AgentDesk-Token", token);
        return factory.CreateClient().SendAsync(pedido);
    }

    private static async Task<JsonElement> SessaoAoVivoAsync(HttpClient http, string sessao)
    {
        var aoVivo = await (await http.GetAsync($"{Rota}/ao-vivo")).JsonAsync();
        return aoVivo.GetProperty("projetos").EnumerateArray().SelectMany(p => p.GetProperty("sessoes").EnumerateArray())
            .Single(s => s.GetProperty("sessaoId").GetString() == sessao);
    }

    private static string NovaSessao() => $"controle-{Guid.NewGuid():N}";

    private async Task<Guid> PedirPermissaoAsync(Conta c, string sessao, string ferramenta = "Bash", string? resumo = "npm test")
    {
        var resposta = await Coletor(c.Token, HttpMethod.Post, $"{Rota}/controle/permissoes", new { sessaoId = sessao, ferramenta, resumo });
        Assert.Equal(HttpStatusCode.Created, resposta.StatusCode);
        return (await resposta.JsonAsync()).GetProperty("permissaoId").GetGuid();
    }

    // ---- Parar ----

    [Fact]
    public async Task Parar_marca_a_sessao_e_o_hook_consome_o_pedido_uma_vez_so()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        Assert.False((await SessaoAoVivoAsync(c.Http, sessao)).GetProperty("pararSolicitado").GetBoolean());

        Assert.Equal(HttpStatusCode.Accepted, (await c.Http.PostAsync($"{Rota}/{sessao}/parar", null)).StatusCode);

        Assert.True((await SessaoAoVivoAsync(c.Http, sessao)).GetProperty("pararSolicitado").GetBoolean());
        var primeira = await (await Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/parada?sessaoId={sessao}")).JsonAsync();
        Assert.True(primeira.GetProperty("parar").GetBoolean());
        var segunda = await (await Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/parada?sessaoId={sessao}")).JsonAsync();
        Assert.False(segunda.GetProperty("parar").GetBoolean()); // já consumido
        Assert.False((await SessaoAoVivoAsync(c.Http, sessao)).GetProperty("pararSolicitado").GetBoolean());
    }

    [Fact]
    public async Task Sem_pedido_de_parada_o_hook_segue_e_pedido_vencido_nao_vale()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);

        Assert.False((await (await Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/parada?sessaoId={sessao}")).JsonAsync()).GetProperty("parar").GetBoolean());

        await c.Http.PostAsync($"{Rota}/{sessao}/parar", null);
        await factory.ExecutarAsync("UPDATE cc_paradas SET expira_em = now() - interval '1 hour' WHERE usuario_id = @U", new { U = c.Id });
        Assert.False((await (await Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/parada?sessaoId={sessao}")).JsonAsync()).GetProperty("parar").GetBoolean());
    }

    [Fact]
    public async Task So_o_dono_para_a_sessao_e_sessao_inexistente_responde_404()
    {
        var sessao = NovaSessao();
        var dono = await ContaComSessaoAsync(sessao);
        var intruso = await factory.ClienteNovoUsuarioAsync();

        var negada = await intruso.PostAsync($"{Rota}/{sessao}/parar", null);
        Assert.Equal(HttpStatusCode.NotFound, negada.StatusCode);
        Assert.Equal("Sessoes.SessaoNaoEncontrada", await negada.CodigoErroAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await dono.Http.PostAsync($"{Rota}/nao-existe/parar", null)).StatusCode);
        // O pedido do intruso não vazou para o hook do dono
        Assert.False((await (await Coletor(dono.Token, HttpMethod.Get, $"{Rota}/controle/parada?sessaoId={sessao}")).JsonAsync()).GetProperty("parar").GetBoolean());
    }

    [Fact]
    public async Task Hook_com_token_invalido_responde_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Coletor(null, HttpMethod.Get, $"{Rota}/controle/parada?sessaoId=x")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Coletor("adk_naoexiste", HttpMethod.Get, $"{Rota}/controle/parada?sessaoId=x")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Coletor("adk_naoexiste", HttpMethod.Post, $"{Rota}/controle/permissoes",
            new { sessaoId = "x", ferramenta = "Bash" })).StatusCode);
    }

    // ---- Aprovar / Negar ----

    [Fact]
    public async Task Pedido_de_permissao_aparece_na_sessao_e_o_app_aprova()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);

        var id = await PedirPermissaoAsync(c, sessao, "Bash", "npm test");

        var pendente = (await SessaoAoVivoAsync(c.Http, sessao)).GetProperty("permissaoPendente");
        Assert.Equal(id, pendente.GetProperty("permissaoId").GetGuid());
        Assert.Equal("Bash", pendente.GetProperty("ferramenta").GetString());
        Assert.Equal("npm test", pendente.GetProperty("resumo").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PostAsJsonAsync($"{Rota}/permissoes/{id}/decidir", new { decisao = "APROVAR" })).StatusCode);

        var decisao = await (await Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/permissoes/{id}?espera=1")).JsonAsync();
        Assert.Equal("APROVAR", decisao.GetProperty("decisao").GetString());
        Assert.False((await SessaoAoVivoAsync(c.Http, sessao)).TryGetProperty("permissaoPendente", out _)); // some depois de decidida
    }

    [Fact]
    public async Task Negar_chega_ao_hook()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        var id = await PedirPermissaoAsync(c, sessao);

        await c.Http.PostAsJsonAsync($"{Rota}/permissoes/{id}/decidir", new { decisao = "NEGAR" });

        var decisao = await (await Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/permissoes/{id}?espera=1")).JsonAsync();
        Assert.Equal("NEGAR", decisao.GetProperty("decisao").GetString());
    }

    [Fact]
    public async Task Sem_decisao_a_espera_termina_com_decisao_nula_e_nada_e_aprovado_sozinho()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        var id = await PedirPermissaoAsync(c, sessao);

        var relogio = Stopwatch.StartNew();
        var decisao = await (await Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/permissoes/{id}?espera=1")).JsonAsync();

        Assert.False(decisao.TryGetProperty("decisao", out var d) && d.ValueKind != JsonValueKind.Null);
        Assert.InRange(relogio.Elapsed, TimeSpan.FromMilliseconds(900), TimeSpan.FromSeconds(4));
    }

    [Fact]
    public async Task A_espera_acaba_na_hora_quando_o_app_decide_no_meio()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        var id = await PedirPermissaoAsync(c, sessao);

        var relogio = Stopwatch.StartNew();
        var espera = Coletor(c.Token, HttpMethod.Get, $"{Rota}/controle/permissoes/{id}?espera=20");
        await Task.Delay(600);
        await c.Http.PostAsJsonAsync($"{Rota}/permissoes/{id}/decidir", new { decisao = "APROVAR" });
        var decisao = await (await espera.WaitAsync(TimeSpan.FromSeconds(10))).JsonAsync();

        Assert.Equal("APROVAR", decisao.GetProperty("decisao").GetString());
        Assert.True(relogio.Elapsed < TimeSpan.FromSeconds(5), $"esperou {relogio.Elapsed}");
    }

    [Fact]
    public async Task Decidir_de_novo_responde_409_e_pedido_vencido_ou_de_outro_usuario_responde_404()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        var intruso = await factory.ClienteNovoUsuarioAsync();
        var id = await PedirPermissaoAsync(c, sessao);

        Assert.Equal(HttpStatusCode.NotFound, (await intruso.PostAsJsonAsync($"{Rota}/permissoes/{id}/decidir", new { decisao = "APROVAR" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PostAsJsonAsync($"{Rota}/permissoes/{id}/decidir", new { decisao = "NEGAR" })).StatusCode);
        var repetida = await c.Http.PostAsJsonAsync($"{Rota}/permissoes/{id}/decidir", new { decisao = "APROVAR" });
        Assert.Equal(HttpStatusCode.Conflict, repetida.StatusCode);
        Assert.Equal("Sessoes.PermissaoJaDecidida", await repetida.CodigoErroAsync());

        var vencida = await PedirPermissaoAsync(c, sessao);
        await factory.ExecutarAsync("UPDATE cc_permissoes SET expira_em = now() - interval '1 hour' WHERE permissao_id = @Id", new { Id = vencida });
        var tarde = await c.Http.PostAsJsonAsync($"{Rota}/permissoes/{vencida}/decidir", new { decisao = "APROVAR" });
        Assert.Equal(HttpStatusCode.NotFound, tarde.StatusCode);
        Assert.Equal("Sessoes.PermissaoNaoEncontrada", await tarde.CodigoErroAsync());
        Assert.False((await SessaoAoVivoAsync(c.Http, sessao)).TryGetProperty("permissaoPendente", out _)); // vencida não aparece
    }

    [Theory]
    [InlineData("TALVEZ")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Decisao_invalida_responde_400(string? decisao)
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        var id = await PedirPermissaoAsync(c, sessao);

        var resposta = await c.Http.PostAsJsonAsync($"{Rota}/permissoes/{id}/decidir", new { decisao });

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.Equal("Validacao.Falhou", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Hook_de_outro_usuario_nao_enxerga_o_pedido_e_corpo_invalido_responde_400()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        var outro = await ContaComSessaoAsync(NovaSessao());
        var id = await PedirPermissaoAsync(c, sessao);

        Assert.Equal(HttpStatusCode.NotFound, (await Coletor(outro.Token, HttpMethod.Get, $"{Rota}/controle/permissoes/{id}?espera=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Coletor(c.Token, HttpMethod.Post, $"{Rota}/controle/permissoes", new { sessaoId = sessao, ferramenta = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Coletor(c.Token, HttpMethod.Post, $"{Rota}/controle/permissoes",
            new { sessaoId = sessao, ferramenta = "Bash", resumo = new string('x', 121) })).StatusCode);
    }

    [Fact]
    public async Task Limite_de_pedidos_pendentes_por_usuario()
    {
        var sessao = NovaSessao();
        var c = await ContaComSessaoAsync(sessao);
        for (var i = 0; i < 20; i++) await PedirPermissaoAsync(c, sessao);

        var demais = await Coletor(c.Token, HttpMethod.Post, $"{Rota}/controle/permissoes", new { sessaoId = sessao, ferramenta = "Bash" });

        Assert.Equal(HttpStatusCode.Conflict, demais.StatusCode);
        Assert.Equal("Sessoes.PermissoesPendentesDemais", await demais.CodigoErroAsync());
    }

    [Fact]
    public async Task Controle_do_app_exige_login()
    {
        var anonimo = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsync($"{Rota}/x/parar", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsJsonAsync($"{Rota}/permissoes/{Guid.NewGuid()}/decidir", new { decisao = "APROVAR" })).StatusCode);
    }
}
