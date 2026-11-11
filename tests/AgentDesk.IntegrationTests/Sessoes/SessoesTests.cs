using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;
using AgentDesk.Modules.Sessoes.Application.Sessoes;
using AgentDesk.Modules.Sessoes.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace AgentDesk.IntegrationTests.Sessoes;

[Collection(ApiCollection.Nome)]
public sealed class SessoesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/sessoes";
    private static readonly DateTimeOffset Base = DateTimeOffset.UtcNow.AddMinutes(-20);

    private sealed record Conta(HttpClient Http, Guid Id, string Token);

    private async Task<Conta> ContaComTokenAsync()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var criado = await (await http.PostAsJsonAsync($"{Rota}/tokens", new { nome = "Notebook" })).JsonAsync();
        return new Conta(http, await AgentDeskApiFactory.IdAsync(http), criado.GetProperty("segredo").GetString()!);
    }

    private Task<HttpResponseMessage> EnviarAsync(string? token, object evento)
    {
        var pedido = new HttpRequestMessage(HttpMethod.Post, $"{Rota}/eventos") { Content = JsonContent.Create(evento) };
        if (token is not null) pedido.Headers.Add("X-AgentDesk-Token", token);
        return factory.CreateClient().SendAsync(pedido);
    }

    private static object Evento(string sessao, string evento, int segundos, string? ferramenta = null, string? resumo = null,
        string? notificacao = null, string projeto = "agent-desk", string chave = "a1b2c3d4e5f6")
        => new
        {
            sessaoId = sessao, evento, maquina = "Notebook", projeto, projetoChave = chave, ferramenta, resumo, notificacao,
            ocorridoEm = Base.AddSeconds(segundos),
        };

    private static async Task<JsonElement?> SessaoAoVivoAsync(HttpClient http, string sessao)
    {
        var aoVivo = await (await http.GetAsync($"{Rota}/ao-vivo")).JsonAsync();
        foreach (var p in aoVivo.GetProperty("projetos").EnumerateArray())
            foreach (var s in p.GetProperty("sessoes").EnumerateArray())
                if (s.GetProperty("sessaoId").GetString() == sessao) return s;
        return null;
    }

    private static string Status(JsonElement? s) => s!.Value.GetProperty("status").GetString()!;
    private static string Atividade(JsonElement? s) => s!.Value.GetProperty("atividade").GetString()!;

    [Fact]
    public async Task Token_aparece_uma_vez_e_pode_ser_revogado()
    {
        var http = await factory.ClienteNovoUsuarioAsync();

        var criado = await http.PostAsJsonAsync($"{Rota}/tokens", new { nome = "  Notebook do trabalho " });
        Assert.Equal(HttpStatusCode.Created, criado.StatusCode);
        var corpo = await criado.JsonAsync();
        var segredo = corpo.GetProperty("segredo").GetString()!;
        Assert.StartsWith("adk_", segredo);
        Assert.Equal(segredo[..12], corpo.GetProperty("token").GetProperty("prefixo").GetString());
        var tokenId = corpo.GetProperty("token").GetProperty("tokenId").GetGuid();

        var lista = await http.GetAsync($"{Rota}/tokens");
        Assert.DoesNotContain(segredo, await lista.Content.ReadAsStringAsync()); // a lista nunca traz o segredo
        Assert.Equal("Notebook do trabalho", (await lista.JsonAsync())[0].GetProperty("nome").GetString());
        Assert.NotNull(await factory.ConsultarAsync<string>("SELECT hash_sha256 FROM tokens_ingestao WHERE token_id = @Id", new { Id = tokenId }));

        var outro = await factory.ClienteNovoUsuarioAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await outro.DeleteAsync($"{Rota}/tokens/{tokenId}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"{Rota}/tokens/{tokenId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.DeleteAsync($"{Rota}/tokens/{tokenId}")).StatusCode);
        var negado = await EnviarAsync(segredo, Evento("s-revogado", "SessionStart", 0));
        Assert.Equal(HttpStatusCode.Unauthorized, negado.StatusCode);
        Assert.Equal("Sessoes.TokenInvalido", await negado.CodigoErroAsync());
    }

    [Fact]
    public async Task Nome_vazio_responde_400_e_o_limite_e_de_10_tokens_ativos()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsJsonAsync($"{Rota}/tokens", new { nome = " " })).StatusCode);

        for (var i = 0; i < 10; i++) (await http.PostAsJsonAsync($"{Rota}/tokens", new { nome = $"Máquina {i}" })).EnsureSuccessStatusCode();
        var excesso = await http.PostAsJsonAsync($"{Rota}/tokens", new { nome = "A 11ª" });
        Assert.Equal(HttpStatusCode.Conflict, excesso.StatusCode);
        Assert.Equal("Sessoes.LimiteDeTokens", await excesso.CodigoErroAsync());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("adk_token-que-nao-existe-0000000000000000000000")]
    [InlineData("Bearer qualquer-coisa")]
    public async Task Ingestao_sem_token_valido_responde_401(string? token)
    {
        var resposta = await EnviarAsync(token, Evento("s-x", "SessionStart", 0));
        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);
    }

    [Fact]
    public async Task Eventos_dos_hooks_movem_o_status_e_o_balao_da_sessao()
    {
        var c = await ContaComTokenAsync();
        var s = $"sessao-{Guid.NewGuid():N}";

        Assert.Equal(HttpStatusCode.Accepted, (await EnviarAsync(c.Token, Evento(s, "SessionStart", 0))).StatusCode);
        var aberta = await SessaoAoVivoAsync(c.Http, s);
        Assert.Equal("OCIOSA", Status(aberta));
        Assert.Equal("Notebook", aberta!.Value.GetProperty("maquina").GetString());

        await EnviarAsync(c.Token, Evento(s, "UserPromptSubmit", 1));
        Assert.Equal("💭 Pensando…", Atividade(await SessaoAoVivoAsync(c.Http, s)));

        await EnviarAsync(c.Token, Evento(s, "PreToolUse", 2, "Read", "api.ts"));
        var lendo = await SessaoAoVivoAsync(c.Http, s);
        Assert.Equal("TRABALHANDO", Status(lendo));
        Assert.Equal("📖 Lendo api.ts", Atividade(lendo));

        await EnviarAsync(c.Token, Evento(s, "Notification", 4, notificacao: "permission_prompt"));
        var esperando = await SessaoAoVivoAsync(c.Http, s);
        Assert.Equal("ESPERANDO_VOCE", Status(esperando));
        Assert.StartsWith("✋ Precisa de você", Atividade(esperando));

        await EnviarAsync(c.Token, Evento(s, "Stop", 6));
        // Um hook atrasado (mais velho que o Stop) entra na linha do tempo, mas não "ressuscita" a sessão
        await EnviarAsync(c.Token, Evento(s, "PreToolUse", 5, "Bash", "npm test"));
        var terminou = await SessaoAoVivoAsync(c.Http, s);
        Assert.Equal("OCIOSA", Status(terminou));
        Assert.Equal("✅ Terminou", Atividade(terminou));
        Assert.Equal(6, await factory.ConsultarAsync<long>("SELECT COUNT(*) FROM cc_eventos WHERE sessao_id = @S", new { S = s }));

        // Encerrada agora: ainda aparece por 15 min (a "despedida" do robô)
        await EnviarAsync(c.Token, new { sessaoId = s, evento = "SessionEnd", maquina = "Notebook", projeto = "agent-desk", projetoChave = "a1b2c3d4e5f6" });
        Assert.Equal("ENCERRADA", Status(await SessaoAoVivoAsync(c.Http, s)));
    }

    [Fact]
    public async Task Titulo_da_tarefa_aparece_na_sessao_sobrevive_a_eventos_sem_titulo_e_muda_quando_a_conversa_e_renomeada()
    {
        var c = await ContaComTokenAsync();
        var s = $"sessao-{Guid.NewGuid():N}";
        static object ComTitulo(string sessao, string evento, int segundos, string? titulo)
            => new { sessaoId = sessao, evento, maquina = "Notebook", projeto = "zena", projetoChave = "a1b2c3d4e5f6", titulo, ocorridoEm = Base.AddSeconds(segundos) };

        await EnviarAsync(c.Token, Evento(s, "SessionStart", 0));
        Assert.Equal(JsonValueKind.Null, (await SessaoAoVivoAsync(c.Http, s))!.Value.GetProperty("titulo").ValueKind);

        await EnviarAsync(c.Token, ComTitulo(s, "UserPromptSubmit", 1, "Lançamento de pagamento em dinheiro"));
        Assert.Equal("Lançamento de pagamento em dinheiro", (await SessaoAoVivoAsync(c.Http, s))!.Value.GetProperty("titulo").GetString());

        // Os eventos de ferramenta não trazem o título: o último continua valendo
        await EnviarAsync(c.Token, Evento(s, "PreToolUse", 2, "Read", "api.ts"));
        Assert.Equal("Lançamento de pagamento em dinheiro", (await SessaoAoVivoAsync(c.Http, s))!.Value.GetProperty("titulo").GetString());

        await EnviarAsync(c.Token, ComTitulo(s, "Stop", 3, "Funcionalidade de cortesia"));
        Assert.Equal("Funcionalidade de cortesia", (await SessaoAoVivoAsync(c.Http, s))!.Value.GetProperty("titulo").GetString());

        // Título grande demais é recusado (o coletor já corta em 120)
        Assert.Equal(HttpStatusCode.BadRequest, (await EnviarAsync(c.Token, ComTitulo(s, "Stop", 4, new string('x', 121)))).StatusCode);
    }

    [Fact]
    public async Task Cada_projeto_vira_uma_sala_mesmo_com_o_mesmo_nome_de_pasta()
    {
        var c = await ContaComTokenAsync();
        await EnviarAsync(c.Token, Evento("s-a", "SessionStart", 0, projeto: "api", chave: "aaaaaaaaaaaa"));
        await EnviarAsync(c.Token, Evento("s-b", "SessionStart", 1, projeto: "api", chave: "bbbbbbbbbbbb"));
        await EnviarAsync(c.Token, Evento("s-c", "SessionStart", 2, projeto: "api", chave: "bbbbbbbbbbbb"));

        var projetos = (await (await c.Http.GetAsync($"{Rota}/ao-vivo")).JsonAsync()).GetProperty("projetos").EnumerateArray().ToList();

        Assert.Equal(2, projetos.Count);
        Assert.Equal(2, projetos.Single(p => p.GetProperty("chave").GetString() == "bbbbbbbbbbbb").GetProperty("sessoes").GetArrayLength());
    }

    [Fact]
    public async Task Evento_desconhecido_e_aceito_e_ignorado_e_campo_faltando_responde_400()
    {
        var c = await ContaComTokenAsync();

        Assert.Equal(HttpStatusCode.Accepted, (await EnviarAsync(c.Token, Evento("s-novo", "EventoDoFuturo", 0))).StatusCode);
        Assert.Null(await SessaoAoVivoAsync(c.Http, "s-novo"));

        var semChave = await EnviarAsync(c.Token, new { sessaoId = "s", evento = "Stop", projeto = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, semChave.StatusCode);
        Assert.True((await semChave.JsonAsync()).GetProperty("errors").TryGetProperty("projetoChave", out _));
    }

    [Fact]
    public async Task Cada_usuario_so_ve_as_proprias_sessoes()
    {
        var dono = await ContaComTokenAsync();
        var outro = await ContaComTokenAsync();
        await EnviarAsync(dono.Token, Evento("s-compartilhado", "UserPromptSubmit", 0));
        await EnviarAsync(outro.Token, Evento("s-compartilhado", "Stop", 1)); // mesmo id, mas é outra conta

        Assert.Equal("TRABALHANDO", Status(await SessaoAoVivoAsync(dono.Http, "s-compartilhado")));
        Assert.Equal("OCIOSA", Status(await SessaoAoVivoAsync(outro.Http, "s-compartilhado")));
        Assert.Null(await SessaoAoVivoAsync((await factory.ClienteNovoUsuarioAsync()), "s-compartilhado"));
    }

    // ---- Telemetria (OTLP/JSON) ----

    private static string Otlp(string sessao, int entrada, int saida, int cacheLeitura, double custo, string modelo = "claude-opus-5-5")
    {
        object Atributo(string chave, object valor) => new { key = chave, value = valor };
        var registro = new
        {
            timeUnixNano = (Base.AddMinutes(1).ToUnixTimeMilliseconds() * 1_000_000).ToString(),
            body = new { stringValue = "claude_code.api_request" },
            attributes = new[]
            {
                Atributo("event.name", new { stringValue = "api_request" }),
                Atributo("session.id", new { stringValue = sessao }),
                Atributo("model", new { stringValue = modelo }),
                Atributo("input_tokens", new { intValue = entrada.ToString() }), // int64 vira texto no JSON do OTLP
                Atributo("output_tokens", new { intValue = saida }),
                Atributo("cache_read_tokens", new { stringValue = cacheLeitura.ToString() }),
                Atributo("cache_creation_tokens", new { intValue = "0" }),
                Atributo("cost_usd", new { doubleValue = custo }),
            },
        };
        var prompt = new
        {
            body = new { stringValue = "claude_code.user_prompt" },
            attributes = new[] { Atributo("event.name", new { stringValue = "user_prompt" }), Atributo("prompt", new { stringValue = "<REDACTED>" }) },
        };
        return JsonSerializer.Serialize(new
        {
            resourceLogs = new[]
            {
                new { resource = new { attributes = new[] { Atributo("service.name", new { stringValue = "claude-code" }) } },
                      scopeLogs = new[] { new { logRecords = new object[] { prompt, registro } } } },
            },
        });
    }

    private Task<HttpResponseMessage> EnviarOtlpAsync(string token, string json, bool gzip = false)
    {
        HttpContent conteudo;
        if (gzip)
        {
            var memoria = new MemoryStream();
            using (var z = new GZipStream(memoria, CompressionLevel.Fastest, leaveOpen: true)) z.Write(Encoding.UTF8.GetBytes(json));
            conteudo = new ByteArrayContent(memoria.ToArray());
            conteudo.Headers.ContentEncoding.Add("gzip");
        }
        else conteudo = new StringContent(json, Encoding.UTF8);
        conteudo.Headers.ContentType = new("application/json");
        var pedido = new HttpRequestMessage(HttpMethod.Post, $"{Rota}/otlp/v1/logs") { Content = conteudo };
        pedido.Headers.Add("X-AgentDesk-Token", token);
        return factory.CreateClient().SendAsync(pedido);
    }

    [Fact]
    public async Task Telemetria_soma_tokens_e_custo_na_sessao_e_no_total_do_dia()
    {
        var c = await ContaComTokenAsync();
        var s = $"otlp-{Guid.NewGuid():N}";
        await EnviarAsync(c.Token, Evento(s, "SessionStart", 0, projeto: "loja-virtual"));

        var r1 = await EnviarOtlpAsync(c.Token, Otlp(s, 1000, 500, 2000, 0.0145));
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        Assert.Equal("{}", await r1.Content.ReadAsStringAsync()); // ExportLogsServiceResponse vazio
        Assert.Equal(HttpStatusCode.OK, (await EnviarOtlpAsync(c.Token, Otlp(s, 200, 100, 3000, 0.0055), gzip: true)).StatusCode);

        var sessao = (await SessaoAoVivoAsync(c.Http, s))!.Value;
        Assert.Equal(2, sessao.GetProperty("pedidos").GetInt32());
        Assert.Equal(1200 + 600 + 5000, sessao.GetProperty("tokens").GetInt64());
        Assert.Equal(5000, sessao.GetProperty("tokensCacheLeitura").GetInt64());
        Assert.Equal(0.02m, sessao.GetProperty("custoUsd").GetDecimal());
        Assert.Equal("claude-opus-5-5", sessao.GetProperty("modelo").GetString());
        Assert.Equal("OCIOSA", Status(sessao)); // telemetria não muda o status (quem muda são os hooks)

        Assert.Equal(0.02m, await factory.ConsultarAsync<decimal>(
            "SELECT custo_usd FROM cc_consumo_diario WHERE usuario_id = @U AND projeto = 'loja-virtual'", new { U = c.Id }));
        Assert.Equal(2, await factory.ConsultarAsync<long>(
            "SELECT COUNT(*) FROM cc_eventos WHERE sessao_id = @S AND tipo = 'api_request'", new { S = s })); // o user_prompt foi ignorado
    }

    [Fact]
    public async Task Telemetria_antes_do_primeiro_hook_cria_a_sessao_e_o_hook_corrige_o_projeto()
    {
        var c = await ContaComTokenAsync();
        var s = $"otlp-cedo-{Guid.NewGuid():N}";

        await EnviarOtlpAsync(c.Token, Otlp(s, 10, 5, 0, 0.001));
        Assert.Equal("(sem projeto)", await factory.ConsultarAsync<string>(
            "SELECT projeto FROM cc_sessoes WHERE sessao_id = @S", new { S = s }));

        await EnviarAsync(c.Token, Evento(s, "PreToolUse", 120, "Grep", "SortMenu", projeto: "app-mobile"));
        Assert.Equal("app-mobile", await factory.ConsultarAsync<string>("SELECT projeto FROM cc_sessoes WHERE sessao_id = @S", new { S = s }));
        Assert.Equal("🔎 Procurando SortMenu", Atividade(await SessaoAoVivoAsync(c.Http, s)));
    }

    [Fact]
    public async Task Telemetria_sem_token_ou_fora_do_formato_e_recusada()
    {
        var c = await ContaComTokenAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await EnviarOtlpAsync("adk_nao-existe-00000000000000000000000000000", Otlp("s", 1, 1, 0, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await EnviarOtlpAsync(c.Token, "isto não é json")).StatusCode);
    }

    // ---- Limpeza da linha do tempo (rotina diária, desligada no host de testes) ----

    [Fact]
    public async Task Limpeza_apaga_eventos_com_mais_de_90_dias_e_mantem_os_recentes()
    {
        var c = await ContaComTokenAsync();
        await factory.ExecutarAsync("""
            INSERT INTO cc_eventos (usuario_id, sessao_id, tipo, ocorrido_em) VALUES
              (@U, 'velha', 'Stop', now() - INTERVAL '91 days'),
              (@U, 'nova', 'Stop', now() - INTERVAL '89 days')
            """, new { U = c.Id });

        var apagados = await factory.Services.GetRequiredService<LimpezaEventosRotina>().ExecutarUmaVezAsync(CancellationToken.None);

        Assert.True(apagados >= 1);
        Assert.Equal(0, await factory.ConsultarAsync<long>("SELECT COUNT(*) FROM cc_eventos WHERE usuario_id = @U AND sessao_id = 'velha'", new { U = c.Id }));
        Assert.Equal(1, await factory.ConsultarAsync<long>("SELECT COUNT(*) FROM cc_eventos WHERE usuario_id = @U AND sessao_id = 'nova'", new { U = c.Id }));
    }

    [Fact]
    public async Task Falha_na_limpeza_vai_para_o_log_e_nao_derruba_a_api()
    {
        var servicos = new ServiceCollection().AddScoped<ISessoesRepository, RepositorioQueFalha>().BuildServiceProvider();
        var rotina = new LimpezaEventosRotina(servicos.GetRequiredService<IServiceScopeFactory>(), TimeProvider.System,
            NullLogger<LimpezaEventosRotina>.Instance);

        Assert.Equal(-1, await rotina.ExecutarUmaVezAsync(CancellationToken.None));
    }

    /// <summary>Subagente só aparece com sinal nos últimos 10 min: estes eventos são de 2 min atrás (o <c>Base</c> dos outros é de 20).</summary>
    private static readonly DateTimeOffset Recente = DateTimeOffset.UtcNow.AddMinutes(-2);

    private static object EventoDeSubagente(string sessao, string evento, int segundos, string? agente, string? tipo = "Explore",
        string? ferramenta = null, string? resumo = null)
        => new
        {
            sessaoId = sessao, evento, maquina = "Notebook", projeto = "agent-desk", projetoChave = "a1b2c3d4e5f6", ferramenta, resumo,
            ocorridoEm = Recente.AddSeconds(segundos), agenteId = agente, agenteTipo = tipo,
        };

    private static async Task<List<JsonElement>> AjudantesAsync(HttpClient http, string sessao)
        => (await SessaoAoVivoAsync(http, sessao))!.Value.GetProperty("subagentes").EnumerateArray().ToList();

    private static JsonElement Ajudante(List<JsonElement> lista, string id) => lista.Single(a => a.GetProperty("agenteId").GetString() == id);

    [Fact]
    public async Task Subagente_vira_um_robo_ajudante_com_a_propria_atividade_e_some_quando_termina()
    {
        var c = await ContaComTokenAsync();
        var s = $"sessao-{Guid.NewGuid():N}";
        await EnviarAsync(c.Token, Evento(s, "UserPromptSubmit", 0));

        await EnviarAsync(c.Token, EventoDeSubagente(s, "SubagentStart", 1, "ag-1"));
        await EnviarAsync(c.Token, EventoDeSubagente(s, "SubagentStart", 1, "ag-2", "Plan"));
        await EnviarAsync(c.Token, EventoDeSubagente(s, "PreToolUse", 2, "ag-1", "Explore", "Grep", "“SortMenu”"));

        var ajudantes = await AjudantesAsync(c.Http, s);
        Assert.Equal(2, ajudantes.Count);
        Assert.Equal("Explore", Ajudante(ajudantes, "ag-1").GetProperty("tipo").GetString());
        Assert.Equal("TRABALHANDO", Ajudante(ajudantes, "ag-1").GetProperty("status").GetString());
        Assert.Equal("🔎 Procurando “SortMenu”", Ajudante(ajudantes, "ag-1").GetProperty("atividade").GetString());
        Assert.Equal("Plan", Ajudante(ajudantes, "ag-2").GetProperty("tipo").GetString());
        Assert.Equal("💭 Pensando…", Ajudante(ajudantes, "ag-2").GetProperty("atividade").GetString());

        // A ferramenta do subagente não troca o balão da sessão (ela segue "chamando subagente")
        Assert.Equal("👥 Chamando subagente", Atividade(await SessaoAoVivoAsync(c.Http, s)));

        // Um hook atrasado (mais velho que a última atividade do ajudante) não muda nada
        await EnviarAsync(c.Token, EventoDeSubagente(s, "PreToolUse", 1, "ag-1", "Explore", "Read", "velho.ts"));
        Assert.Equal("🔎 Procurando “SortMenu”", Ajudante(await AjudantesAsync(c.Http, s), "ag-1").GetProperty("atividade").GetString());

        // Terminou: o ajudante sai da sala (só fica um instante como ENCERRADA, e este já terminou há ~2 min)
        await EnviarAsync(c.Token, EventoDeSubagente(s, "SubagentStop", 3, "ag-1"));
        Assert.Equal(1, await factory.ConsultarAsync<long>("SELECT COUNT(*) FROM cc_subagentes WHERE usuario_id = @U AND sessao_id = @S AND encerrado_em IS NOT NULL", new { U = c.Id, S = s }));
        Assert.Equal("ag-2", Assert.Single(await AjudantesAsync(c.Http, s)).GetProperty("agenteId").GetString());
    }

    [Fact]
    public async Task Fim_da_sessao_fecha_os_subagentes_que_ficaram_abertos()
    {
        var c = await ContaComTokenAsync();
        var s = $"sessao-{Guid.NewGuid():N}";
        await EnviarAsync(c.Token, EventoDeSubagente(s, "SubagentStart", 0, "ag-x"));
        await EnviarAsync(c.Token, new { sessaoId = s, evento = "SessionEnd", maquina = "Notebook", projeto = "agent-desk", projetoChave = "a1b2c3d4e5f6" });

        Assert.Equal(1, await factory.ConsultarAsync<long>("SELECT COUNT(*) FROM cc_subagentes WHERE usuario_id = @U AND sessao_id = @S AND encerrado_em IS NOT NULL", new { U = c.Id, S = s }));
        Assert.Empty(await AjudantesAsync(c.Http, s)); // sessão encerrada não tem ajudantes
    }

    [Fact]
    public async Task Subagente_sem_sinal_ha_dez_minutos_sai_da_sala_mesmo_sem_o_SubagentStop()
    {
        var c = await ContaComTokenAsync();
        var s = $"sessao-{Guid.NewGuid():N}";
        // O Base fica 20 min no passado: o ajudante nunca mais deu sinal
        await EnviarAsync(c.Token, new
        {
            sessaoId = s, evento = "SubagentStart", maquina = "Notebook", projeto = "agent-desk", projetoChave = "a1b2c3d4e5f6",
            ocorridoEm = Base, agenteId = "ag-perdido", agenteTipo = "Explore",
        });
        await EnviarAsync(c.Token, Evento(s, "UserPromptSubmit", 1));

        Assert.Empty(await AjudantesAsync(c.Http, s));
    }

    [Fact]
    public async Task Evento_sem_id_de_subagente_continua_funcionando_como_antes()
    {
        var c = await ContaComTokenAsync();
        var s = $"sessao-{Guid.NewGuid():N}";
        await EnviarAsync(c.Token, Evento(s, "SubagentStart", 0, resumo: "Explore"));

        Assert.Equal("👥 Chamando subagente Explore", Atividade(await SessaoAoVivoAsync(c.Http, s)));
        Assert.Empty(await AjudantesAsync(c.Http, s));
    }

    private static int Lugar(JsonElement? s) => s!.Value.GetProperty("lugar").GetInt32();

    [Fact]
    public async Task Cada_sessao_ganha_um_lugar_fixo_na_sala_e_quem_sai_libera_o_lugar_para_a_proxima()
    {
        var c = await ContaComTokenAsync();
        const string chave = "dddddddddddd";
        var (a, b, d) = ($"sessao-{Guid.NewGuid():N}", $"sessao-{Guid.NewGuid():N}", $"sessao-{Guid.NewGuid():N}");

        await EnviarAsync(c.Token, Evento(a, "SessionStart", 0, chave: chave));
        await EnviarAsync(c.Token, Evento(b, "SessionStart", 1, chave: chave));
        var sessaoA = await SessaoAoVivoAsync(c.Http, a);
        Assert.Equal(0, Lugar(sessaoA));
        Assert.Equal(1, Lugar(await SessaoAoVivoAsync(c.Http, b)));
        Assert.Equal(chave, sessaoA!.Value.GetProperty("projetoChave").GetString());

        // O lugar não muda com os eventos seguintes (é ele que liga a sessão ao nome salvo na Equipe)
        await EnviarAsync(c.Token, Evento(b, "UserPromptSubmit", 2, chave: chave));
        await EnviarAsync(c.Token, Evento(a, "UserPromptSubmit", 3, chave: chave));
        Assert.Equal(0, Lugar(await SessaoAoVivoAsync(c.Http, a)));
        Assert.Equal(1, Lugar(await SessaoAoVivoAsync(c.Http, b)));

        // A "a" acabou: a próxima sessão do projeto ocupa o lugar 0; a "b" continua no 1
        await EnviarAsync(c.Token, new { sessaoId = a, evento = "SessionEnd", maquina = "Notebook", projeto = "agent-desk", projetoChave = chave });
        await EnviarAsync(c.Token, Evento(d, "SessionStart", 4, chave: chave));
        Assert.Equal(0, Lugar(await SessaoAoVivoAsync(c.Http, d)));
        Assert.Equal(1, Lugar(await SessaoAoVivoAsync(c.Http, b)));
    }

    [Fact]
    public async Task Lugar_de_outro_projeto_nao_conta_e_a_nona_sessao_fica_sem_lugar()
    {
        var c = await ContaComTokenAsync();
        await EnviarAsync(c.Token, Evento("s-outro-projeto", "SessionStart", 0, chave: "eeeeeeeeeeee"));
        var ids = Enumerable.Range(0, 9).Select(_ => $"sessao-{Guid.NewGuid():N}").ToList();
        foreach (var (id, i) in ids.Select((id, i) => (id, i)))
            await EnviarAsync(c.Token, Evento(id, "SessionStart", i + 1, chave: "ffffffffffff"));

        Assert.Equal(0, Lugar(await SessaoAoVivoAsync(c.Http, ids[0]))); // o outro projeto não ocupou o lugar 0 deste
        Assert.Equal(7, Lugar(await SessaoAoVivoAsync(c.Http, ids[7])));
        Assert.False((await SessaoAoVivoAsync(c.Http, ids[8]))!.Value.TryGetProperty("lugar", out _)); // as 8 mesas estavam ocupadas
    }

    [Fact]
    public async Task Sala_pode_ser_juntada_a_um_grupo_e_sair_dele()
    {
        var c = await ContaComTokenAsync();
        await EnviarAsync(c.Token, Evento($"sessao-{Guid.NewGuid():N}", "SessionStart", 0, projeto: "loja", chave: "aaaaaaaaaaaa"));
        await EnviarAsync(c.Token, Evento($"sessao-{Guid.NewGuid():N}", "SessionStart", 1, projeto: "loja-wt", chave: "bbbbbbbbbbbb"));

        Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "aaaaaaaaaaaa", grupo = "  Loja   completa " })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "bbbbbbbbbbbb", grupo = "Loja completa" })).StatusCode);

        var salas = (await (await c.Http.GetAsync($"{Rota}/ao-vivo")).JsonAsync()).GetProperty("projetos").EnumerateArray().ToList();
        Assert.All(salas, p => Assert.Equal("Loja completa", p.GetProperty("grupo").GetString())); // espaços sobrando são arrumados

        Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "bbbbbbbbbbbb", grupo = " " })).StatusCode);
        var depois = (await (await c.Http.GetAsync($"{Rota}/ao-vivo")).JsonAsync()).GetProperty("projetos").EnumerateArray().ToList();
        Assert.False(depois.Single(p => p.GetProperty("chave").GetString() == "bbbbbbbbbbbb").TryGetProperty("grupo", out _)); // sem grupo, o campo nem vem
        Assert.Equal("Loja completa", depois.Single(p => p.GetProperty("chave").GetString() == "aaaaaaaaaaaa").GetProperty("grupo").GetString());
    }

    [Fact]
    public async Task Grupo_e_de_cada_usuario_e_valida_o_pedido()
    {
        var c = await ContaComTokenAsync();
        var outro = await ContaComTokenAsync();
        await EnviarAsync(c.Token, Evento("s-g1", "SessionStart", 0, chave: "cccccccccccc"));
        await EnviarAsync(outro.Token, Evento("s-g2", "SessionStart", 0, chave: "cccccccccccc"));
        await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "cccccccccccc", grupo = "Meu grupo" });

        var doOutro = (await (await outro.Http.GetAsync($"{Rota}/ao-vivo")).JsonAsync()).GetProperty("projetos").EnumerateArray().Single();
        Assert.False(doOutro.TryGetProperty("grupo", out _));

        Assert.Equal(HttpStatusCode.BadRequest, (await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "curta", grupo = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "cccccccccccc", grupo = new string('g', 41) })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "cccccccccccc", grupo = "x" })).StatusCode);
    }

    [Fact]
    public async Task Passar_de_100_salas_agrupadas_responde_409_mas_trocar_o_grupo_de_uma_sala_ja_agrupada_continua_valendo()
    {
        var c = await ContaComTokenAsync();
        for (var i = 0; i < DefinirGrupoHandler.LimiteDeSalas; i++)
            Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = $"{i:D12}", grupo = "G" })).StatusCode);

        var excesso = await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "999999999999", grupo = "G" });
        Assert.Equal(HttpStatusCode.Conflict, excesso.StatusCode);
        Assert.Equal("Sessoes.LimiteDeGrupos", await excesso.CodigoErroAsync());
        Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PutAsJsonAsync($"{Rota}/grupos", new { projetoChave = "000000000000", grupo = "Outro" })).StatusCode);
    }

    private sealed class RepositorioQueFalha : ISessoesRepository
    {
        public Task<IReadOnlyList<Subagente>> ListarSubagentesAsync(Guid u, DateTimeOffset a, DateTimeOffset e, CancellationToken ct) => throw new NotSupportedException();
        public Task AplicarEventoAsync(Guid u, EventoHook e, Transicao t, CancellationToken ct) => throw new NotSupportedException();
        public Task RegistrarUsoAsync(Guid u, UsoModelo uso, DateOnly dia, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<Sessao>> ListarAoVivoAsync(Guid u, DateTimeOffset d, DateTimeOffset e, CancellationToken ct)
            => throw new NotSupportedException();
        public Task<int> LimparEventosAntesDeAsync(DateTimeOffset limite, CancellationToken ct) => throw new InvalidOperationException("banco fora");
    }
}
