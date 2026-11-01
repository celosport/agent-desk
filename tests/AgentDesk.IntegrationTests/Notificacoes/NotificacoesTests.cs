using System.Net;
using System.Net.Http.Json;
using AgentDesk.IntegrationTests.Automacoes;
using AgentDesk.IntegrationTests.Infraestrutura;
using AgentDesk.Modules.Notificacoes.Domain;

namespace AgentDesk.IntegrationTests.Notificacoes;

[Collection(ApiCollection.Nome)]
public sealed class NotificacoesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/notificacoes";
    private const string RotaSessoes = "/api/v1/sessoes";

    private static object Inscricao(string endpoint, string? nome = "Celular do Marcelo")
        => new { endpoint, p256dh = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth = "tBHItJI5svbpez7KI4CCXg", nome };

    private async Task<string> AtivarAsync(HttpClient http, string? nome = "Celular do Marcelo")
    {
        var endpoint = PushFalso.NovoEndpoint();
        (await http.PostAsJsonAsync($"{Rota}/dispositivos", Inscricao(endpoint, nome))).EnsureSuccessStatusCode();
        return endpoint;
    }

    // ---- aparelhos e preferências ----

    [Fact]
    public async Task Registra_o_aparelho_e_a_tela_recebe_a_chave_publica_que_nao_muda()
    {
        var http = await factory.ClienteNovoUsuarioAsync();

        var antes = await (await http.GetAsync(Rota)).JsonAsync();
        Assert.Empty(antes.GetProperty("dispositivos").EnumerateArray());
        var chave = antes.GetProperty("chavePublica").GetString()!;
        Assert.Equal(87, chave.Length); // ponto P-256 não comprimido (65 bytes) em base64 url-safe
        Assert.Equal(chave, (await (await http.GetAsync(Rota)).JsonAsync()).GetProperty("chavePublica").GetString());
        Assert.True(antes.GetProperty("preferencias").GetProperty("sessoes").GetBoolean()); // tudo ligado até desligar

        var endpoint = await AtivarAsync(http);
        // Ativar de novo (mesmo navegador) atualiza o mesmo aparelho em vez de duplicar
        (await http.PostAsJsonAsync($"{Rota}/dispositivos", Inscricao(endpoint, "Outro nome"))).EnsureSuccessStatusCode();

        var depois = (await (await http.GetAsync(Rota)).JsonAsync()).GetProperty("dispositivos").EnumerateArray().ToList();
        var aparelho = Assert.Single(depois);
        Assert.Equal(endpoint, aparelho.GetProperty("endpoint").GetString());
        Assert.Equal("Outro nome", aparelho.GetProperty("nome").GetString());
    }

    [Theory]
    [InlineData("http://fcm.googleapis.com/fcm/send/x")] // sem https
    [InlineData("https://servidor-interno.exemplo.com/push")] // não é um serviço de push
    [InlineData("https://fcm.googleapis.com.evil.com/x")] // domínio parecido
    [InlineData("https://169.254.169.254/latest/meta-data")] // o servidor não pode ser usado para acessar endereços internos
    [InlineData("nao-e-url")]
    public async Task Endereco_que_nao_e_de_um_servico_de_push_conhecido_e_recusado(string endpoint)
    {
        var http = await factory.ClienteNovoUsuarioAsync();

        var resposta = await http.PostAsJsonAsync($"{Rota}/dispositivos", Inscricao(endpoint));

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.Empty((await (await http.GetAsync(Rota)).JsonAsync()).GetProperty("dispositivos").EnumerateArray());
    }

    [Fact]
    public async Task Exige_login_e_cada_usuario_ve_so_os_seus_aparelhos()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(Rota)).StatusCode);
        var dono = await factory.ClienteNovoUsuarioAsync();
        var outro = await factory.ClienteNovoUsuarioAsync();
        await AtivarAsync(dono);

        Assert.Single((await (await dono.GetAsync(Rota)).JsonAsync()).GetProperty("dispositivos").EnumerateArray());
        Assert.Empty((await (await outro.GetAsync(Rota)).JsonAsync()).GetProperty("dispositivos").EnumerateArray());
    }

    [Fact]
    public async Task Desativar_remove_o_aparelho_e_o_que_ja_saiu_nao_da_erro()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var endpoint = await AtivarAsync(http);

        Assert.Equal(HttpStatusCode.NoContent, (await http.PostAsJsonAsync($"{Rota}/dispositivos/remover", new { endpoint })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await http.PostAsJsonAsync($"{Rota}/dispositivos/remover", new { endpoint })).StatusCode);

        Assert.Empty((await (await http.GetAsync(Rota)).JsonAsync()).GetProperty("dispositivos").EnumerateArray());
    }

    [Fact]
    public async Task Nao_aceita_mais_de_dez_aparelhos_por_usuario()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        for (var i = 0; i < 10; i++) await AtivarAsync(http);

        var resposta = await http.PostAsJsonAsync($"{Rota}/dispositivos", Inscricao(PushFalso.NovoEndpoint()));

        Assert.Equal(HttpStatusCode.Conflict, resposta.StatusCode);
        Assert.Equal("Notificacoes.DispositivosDemais", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Alerta_de_teste_chega_ao_aparelho_e_sem_aparelho_explica()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var semAparelho = await http.PostAsync($"{Rota}/teste", null);
        Assert.Equal(HttpStatusCode.Conflict, semAparelho.StatusCode);
        Assert.Equal("Notificacoes.SemDispositivos", await semAparelho.CodigoErroAsync());
        var endpoint = await AtivarAsync(http);

        var resposta = await http.PostAsync($"{Rota}/teste", null);

        Assert.Equal(1, (await resposta.JsonAsync()).GetProperty("entregues").GetInt32());
        var envio = Assert.Single(factory.Push.Enviados(endpoint));
        Assert.Contains("teste", envio.Titulo);
    }

    [Fact]
    public async Task Aparelho_que_o_servico_de_push_nao_conhece_mais_e_apagado_e_falha_de_envio_nao_apaga()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var sumiu = await AtivarAsync(http, "Sumiu");
        var instavel = await AtivarAsync(http, "Instável");
        factory.Push.Responder(sumiu, ResultadoEnvio.DispositivoInvalido); // 404/410 do serviço de push
        factory.Push.Responder(instavel, ResultadoEnvio.Falhou); // erro passageiro

        var resposta = await http.PostAsync($"{Rota}/teste", null);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, resposta.StatusCode);
        Assert.Equal("Notificacoes.NaoEntregue", await resposta.CodigoErroAsync());
        var restantes = (await (await http.GetAsync(Rota)).JsonAsync()).GetProperty("dispositivos").EnumerateArray()
            .Select(d => d.GetProperty("endpoint").GetString()).ToList();
        Assert.Equal([instavel], restantes);
    }

    // ---- sessões do Claude Code ----

    private sealed record Conta(HttpClient Http, string Token);

    private async Task<Conta> ContaComSessoesAsync()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var criado = await (await http.PostAsJsonAsync($"{RotaSessoes}/tokens", new { nome = "Notebook" })).JsonAsync();
        return new Conta(http, criado.GetProperty("segredo").GetString()!);
    }

    private async Task EventoAsync(Conta c, string sessao, string evento, string projeto = "agent-desk", string? ferramenta = null, string? resumo = null,
        string? notificacao = null)
    {
        var pedido = new HttpRequestMessage(HttpMethod.Post, $"{RotaSessoes}/eventos")
        {
            Content = JsonContent.Create(new
            {
                sessaoId = sessao, evento, maquina = "Notebook", projeto, projetoChave = projeto.PadRight(12, 'x')[..12], ferramenta, resumo, notificacao,
                ocorridoEm = DateTimeOffset.UtcNow,
            }),
        };
        pedido.Headers.Add("X-AgentDesk-Token", c.Token);
        (await factory.CreateClient().SendAsync(pedido)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Sessao_que_termina_avisa_e_diz_o_que_ainda_esta_rodando()
    {
        var c = await ContaComSessoesAsync();
        var endpoint = await AtivarAsync(c.Http);
        await EventoAsync(c, "s-pulse", "UserPromptSubmit", "pulse-fit");
        await EventoAsync(c, "s-pulse", "PreToolUse", "pulse-fit", "Edit", "api.ts");
        await EventoAsync(c, "s-agent", "UserPromptSubmit", "agent-desk");
        Assert.Empty(factory.Push.Enviados(endpoint)); // trabalhar não avisa; só terminar

        await EventoAsync(c, "s-agent", "Stop", "agent-desk");

        var envio = Assert.Single(factory.Push.Enviados(endpoint));
        Assert.Equal("✅ agent-desk terminou", envio.Titulo);
        Assert.Contains("Ainda rodando: pulse-fit: ✏️ Editando api.ts", envio.Corpo);
        Assert.DoesNotContain("agent-desk:", envio.Corpo); // a que terminou não aparece como "rodando"
        Assert.Equal("sessao-s-agent", envio.Tag);
    }

    [Fact]
    public async Task Sem_nada_rodando_o_alerta_nao_traz_a_linha_de_andamento()
    {
        var c = await ContaComSessoesAsync();
        var endpoint = await AtivarAsync(c.Http);
        await EventoAsync(c, "s-unica", "UserPromptSubmit");

        await EventoAsync(c, "s-unica", "Stop");

        Assert.DoesNotContain("Ainda rodando", Assert.Single(factory.Push.Enviados(endpoint)).Corpo);
    }

    [Fact]
    public async Task Sessao_esperando_permissao_ou_resposta_avisa_como_permissao()
    {
        var c = await ContaComSessoesAsync();
        var endpoint = await AtivarAsync(c.Http);

        await EventoAsync(c, "s-perm", "Notification", notificacao: "permission_prompt");
        await EventoAsync(c, "s-perm", "Notification", notificacao: "idle_prompt"); // só ociosa: não avisa

        var envio = Assert.Single(factory.Push.Enviados(endpoint));
        Assert.Equal("✋ agent-desk precisa de você", envio.Titulo);
        Assert.Contains("aprovar permissão", envio.Corpo);
    }

    [Fact]
    public async Task Pedido_de_permissao_do_hook_avisa_com_a_ferramenta_e_o_comando()
    {
        var c = await ContaComSessoesAsync();
        var endpoint = await AtivarAsync(c.Http);
        var pedido = new HttpRequestMessage(HttpMethod.Post, $"{RotaSessoes}/controle/permissoes")
        {
            Content = JsonContent.Create(new { sessaoId = "s-hook", ferramenta = "Bash", resumo = "npm test" }),
        };
        pedido.Headers.Add("X-AgentDesk-Token", c.Token);

        Assert.Equal(HttpStatusCode.Created, (await factory.CreateClient().SendAsync(pedido)).StatusCode);

        var envio = Assert.Single(factory.Push.Enviados(endpoint));
        Assert.Equal("✋ Claude Code pede permissão", envio.Titulo);
        Assert.Equal("Bash: npm test", envio.Corpo);
        Assert.Equal("permissao-s-hook", envio.Tag);
    }

    [Fact]
    public async Task Preferencias_desligam_cada_tipo_de_alerta_separadamente()
    {
        var c = await ContaComSessoesAsync();
        var endpoint = await AtivarAsync(c.Http);
        var salvo = await c.Http.PutAsJsonAsync($"{Rota}/preferencias", new { automacoes = true, sessoes = false, permissoes = true });
        Assert.False((await salvo.JsonAsync()).GetProperty("sessoes").GetBoolean());

        await EventoAsync(c, "s-pref", "Stop");
        Assert.Empty(factory.Push.Enviados(endpoint)); // terminar sessão está desligado

        await EventoAsync(c, "s-pref", "Notification", notificacao: "permission_prompt");
        Assert.Single(factory.Push.Enviados(endpoint)); // permissão continua ligada

        Assert.False((await (await c.Http.GetAsync(Rota)).JsonAsync()).GetProperty("preferencias").GetProperty("sessoes").GetBoolean());
    }

    [Fact]
    public async Task Alerta_so_vai_para_os_aparelhos_do_dono_da_sessao()
    {
        var dono = await ContaComSessoesAsync();
        var outro = await factory.ClienteNovoUsuarioAsync();
        var aparelhoDoDono = await AtivarAsync(dono.Http);
        var aparelhoDoOutro = await AtivarAsync(outro);

        await EventoAsync(dono, "s-dono", "Stop");

        Assert.Single(factory.Push.Enviados(aparelhoDoDono));
        Assert.Empty(factory.Push.Enviados(aparelhoDoOutro));
    }

    [Fact]
    public async Task Falha_do_servico_de_push_nao_derruba_a_ingestao_do_evento()
    {
        var c = await ContaComSessoesAsync();
        var endpoint = await AtivarAsync(c.Http);
        factory.Push.Responder(endpoint, ResultadoEnvio.Falhou);

        await EventoAsync(c, "s-falha", "Stop"); // EnsureSuccessStatusCode: continua 2xx

        var aoVivo = await (await c.Http.GetAsync($"{RotaSessoes}/ao-vivo")).JsonAsync();
        Assert.Contains(aoVivo.GetProperty("projetos").EnumerateArray().SelectMany(p => p.GetProperty("sessoes").EnumerateArray()),
            s => s.GetProperty("sessaoId").GetString() == "s-falha");
    }

    // ---- automações ----

    [Fact]
    public async Task Automacao_concluida_avisa_no_celular()
    {
        var u = await factory.UsuarioComChaveAsync();
        var endpoint = await AtivarAsync(u.Http);

        Assert.Equal(HttpStatusCode.OK, (await AutomacoesTests.ExecutarAsync(u.Http, "resumir-documento", "texto")).StatusCode);

        var envio = Assert.Single(factory.Push.Enviados(endpoint));
        Assert.StartsWith("✅ ", envio.Titulo);
        Assert.EndsWith(" concluída", envio.Titulo);
        Assert.Matches(@"^Terminou em \d+ s\.$", envio.Corpo);
        Assert.StartsWith("automacao-", envio.Tag);
    }

    [Fact]
    public async Task Automacao_que_falha_avisa_com_o_motivo()
    {
        var u = await factory.UsuarioComChaveAsync("FORA");
        var endpoint = await AtivarAsync(u.Http);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await AutomacoesTests.ExecutarAsync(u.Http, "resumir-documento", "texto")).StatusCode);

        var envio = Assert.Single(factory.Push.Enviados(endpoint));
        Assert.StartsWith("⚠️ ", envio.Titulo);
        Assert.EndsWith(" falhou", envio.Titulo);
        Assert.False(string.IsNullOrWhiteSpace(envio.Corpo));
    }

    [Fact]
    public async Task Automacao_cancelada_pelo_usuario_nao_avisa()
    {
        var u = await factory.UsuarioComChaveAsync();
        var endpoint = await AtivarAsync(u.Http);
        var execucaoId = Guid.NewGuid();
        var id = await AutomacoesTests.IdAsync(u.Http, "resumir-documento");
        var execucao = u.Http.PostAsJsonAsync($"/api/v1/automacoes/{id}/executar", new { entrada = "Resuma isto [lento]", execucaoId });
        for (var i = 0; i < 100 && !factory.Anthropic.PedidosDa(u.Chave).Any(p => p.Caminho.EndsWith("/v1/messages", StringComparison.Ordinal)); i++)
            await Task.Delay(50);

        await u.Http.PostAsync($"/api/v1/automacoes/execucoes/{execucaoId}/cancelar", null);
        await execucao.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Empty(factory.Push.Enviados(endpoint));
    }

    [Fact]
    public async Task Automacao_que_termina_diz_qual_sessao_do_claude_code_ainda_esta_rodando()
    {
        var u = await factory.UsuarioComChaveAsync();
        var token = await (await u.Http.PostAsJsonAsync($"{RotaSessoes}/tokens", new { nome = "Notebook" })).JsonAsync();
        var conta = new Conta(u.Http, token.GetProperty("segredo").GetString()!);
        var endpoint = await AtivarAsync(u.Http);
        await EventoAsync(conta, "s-roda", "UserPromptSubmit", "pulse-fit");

        await AutomacoesTests.ExecutarAsync(u.Http, "resumir-documento", "texto");

        Assert.Contains("Ainda rodando: pulse-fit", Assert.Single(factory.Push.Enviados(endpoint)).Corpo);
    }
}
