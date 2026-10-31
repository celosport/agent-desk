using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Automacoes;

[Collection(ApiCollection.Nome)]
public sealed class AutomacoesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/automacoes";

    // Uso fixo do falso (1000 entrada, 500 saída, 200 cache leitura, 100 cache escrita) × preços da carga inicial
    internal const decimal CustoOpus = 0.01454m;      // (1000×4 + 500×20 + 200×0,20 + 100×5) / 1.000.000
    private const decimal CustoHaiku = 0.000365m;     // (1000×0,10 + 500×0,50 + 200×0,01 + 100×0,125) / 1.000.000 = 0,0003645 → 6 casas
    private const decimal CustoSonnet = 0.00729m;     // (1000×2 + 500×10 + 200×0,20 + 100×2,50) / 1.000.000
    private const decimal CustoRecusaOpus = 0.004m;   // só os 1000 de entrada

    private sealed class LinhaConsumo
    {
        public string Status { get; set; } = "";
        public string? ErroCodigo { get; set; }
        public string ModeloId { get; set; } = "";
        public string? ModeloUsado { get; set; }
        public int TokensEntrada { get; set; }
        public int TokensTotal { get; set; }
        public decimal CustoUsd { get; set; }
        public decimal? PrecoEntradaMtok { get; set; }
        public string? Resultado { get; set; }
        public string? NomeArquivo { get; set; }
    }

    private Task<LinhaConsumo?> UltimaChamadaAsync(Guid usuarioId) => factory.ConsultarAsync<LinhaConsumo>("""
        SELECT status AS Status, erro_codigo AS ErroCodigo, modelo_id AS ModeloId, modelo_usado AS ModeloUsado,
               tokens_entrada AS TokensEntrada, tokens_total AS TokensTotal, custo_usd AS CustoUsd,
               preco_entrada_mtok AS PrecoEntradaMtok, resultado AS Resultado, nome_arquivo AS NomeArquivo
          FROM consumo_chamadas WHERE usuario_id = @UsuarioId ORDER BY iniciada_em DESC LIMIT 1
        """, new { UsuarioId = usuarioId });

    private Task<long> TotalChamadasAsync(Guid usuarioId)
        => factory.ConsultarAsync<long>("SELECT COUNT(*) FROM consumo_chamadas WHERE usuario_id = @UsuarioId", new { UsuarioId = usuarioId });

    private Task<AgentDeskApiFactory.UsuarioDeTeste> UsuarioComChaveAsync(string final = "OK01") => factory.UsuarioComChaveAsync(final);

    internal static async Task<Guid> IdAsync(HttpClient http, string codigo)
        => (await (await http.GetAsync(Rota)).JsonAsync()).EnumerateArray()
            .Single(a => a.GetProperty("codigo").GetString() == codigo).GetProperty("automacaoId").GetGuid();

    internal static async Task<HttpResponseMessage> ExecutarAsync(HttpClient http, string codigo, string entrada, string? modeloId = null,
        string? nomeArquivo = null)
        => await http.PostAsJsonAsync($"{Rota}/{await IdAsync(http, codigo)}/executar", new { entrada, modeloId, nomeArquivo });

    [Fact]
    public async Task Lista_as_tres_automacoes_predefinidas()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var lista = await (await usuario.GetAsync(Rota)).JsonAsync();

        var codigos = lista.EnumerateArray().Select(a => a.GetProperty("codigo").GetString()).ToList();
        Assert.Equal(["relatorio-executivo", "analisar-codigo", "resumir-documento"], codigos);
        Assert.All(lista.EnumerateArray(), a => Assert.Contains("{{entrada}}", a.GetProperty("modeloMensagem").GetString()));
    }

    [Fact]
    public async Task Executa_na_claude_com_a_chave_do_servidor_e_grava_o_consumo()
    {
        var u = await UsuarioComChaveAsync();

        var resposta = await ExecutarAsync(u.Http, "relatorio-executivo", "Vendas subiram 12% no trimestre.", nomeArquivo: "notas.md");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        var execucao = await resposta.JsonAsync();
        Assert.Equal("# Resultado falso\n\nModelo: claude-opus-5-5\n\nFim do resultado.", execucao.GetProperty("resultado").GetString());
        Assert.Equal("claude-opus-5-5", execucao.GetProperty("modeloId").GetString());
        Assert.False(execucao.GetProperty("truncado").GetBoolean());
        var tokens = execucao.GetProperty("tokens");
        Assert.Equal(1000, tokens.GetProperty("entrada").GetInt32());
        Assert.Equal(500, tokens.GetProperty("saida").GetInt32());
        Assert.Equal(1800, tokens.GetProperty("total").GetInt32());
        Assert.Equal(CustoOpus, execucao.GetProperty("custoUsd").GetDecimal());
        Assert.False(execucao.TryGetProperty("alertaLimite", out _)); // sem limite, sem alerta

        // O pedido que saiu do servidor: chave do usuário, prompt-modelo da automação e fallback ligado no Opus
        var pedido = Assert.Single(factory.Anthropic.PedidosDa(u.Chave), p => p.Caminho == "/v1/messages");
        var json = pedido.Json!;
        Assert.Equal("claude-opus-5-5", json["model"]!.GetValue<string>());
        Assert.Equal(8000, json["max_tokens"]!.GetValue<int>());
        Assert.StartsWith("Você é um analista sênior", json["system"]!.GetValue<string>());
        var mensagem = json["messages"]![0]!["content"]!.GetValue<string>();
        Assert.Contains("<material>\nVendas subiram 12% no trimestre.\n</material>", mensagem);
        Assert.DoesNotContain("{{entrada}}", mensagem);
        Assert.Equal("default", json["fallbacks"]!.GetValue<string>());
        Assert.Equal("server-side-fallback-2026-07-01", pedido.Beta);
        Assert.Null(json["temperature"]);

        // O log: sucesso, custo e preço congelados, resultado guardado
        var linha = await UltimaChamadaAsync(u.Id);
        Assert.Equal("SUCESSO", linha!.Status);
        Assert.Equal(CustoOpus, linha.CustoUsd);
        Assert.Equal(4m, linha.PrecoEntradaMtok);
        Assert.Equal(1800, linha.TokensTotal);
        Assert.Equal("notas.md", linha.NomeArquivo);
        Assert.StartsWith("# Resultado falso", linha.Resultado);
    }

    [Fact]
    public async Task Modelo_escolhido_na_execucao_vale_so_para_ela_e_sem_fallback_no_haiku()
    {
        var u = await UsuarioComChaveAsync();

        var execucao = await (await ExecutarAsync(u.Http, "analisar-codigo", "int x = 1;", modeloId: "claude-haiku-5-5")).JsonAsync();

        Assert.Equal("claude-haiku-5-5", execucao.GetProperty("modeloId").GetString());
        Assert.Equal(CustoHaiku, execucao.GetProperty("custoUsd").GetDecimal());
        var pedido = Assert.Single(factory.Anthropic.PedidosDa(u.Chave), p => p.Caminho == "/v1/messages");
        Assert.Null(pedido.Json!["fallbacks"]);
        Assert.Null(pedido.Beta);
    }

    [Fact]
    public async Task Fallback_cobra_pelo_modelo_que_respondeu()
    {
        var u = await UsuarioComChaveAsync();

        var execucao = await (await ExecutarAsync(u.Http, "relatorio-executivo", "pedido [fallback]")).JsonAsync();

        Assert.Equal("claude-opus-5-5", execucao.GetProperty("modeloId").GetString());
        Assert.Equal(AnthropicFalso.ModeloDoFallback, execucao.GetProperty("modeloUsado").GetString());
        Assert.Equal(CustoSonnet, execucao.GetProperty("custoUsd").GetDecimal());
        Assert.Equal(AnthropicFalso.ModeloDoFallback, (await UltimaChamadaAsync(u.Id))!.ModeloUsado);
    }

    [Fact]
    public async Task Recusa_da_claude_responde_422_e_grava_os_tokens_cobrados()
    {
        var u = await UsuarioComChaveAsync();

        var resposta = await ExecutarAsync(u.Http, "relatorio-executivo", "algo [recusar]");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resposta.StatusCode);
        Assert.Equal("Automacoes.Recusada", await resposta.CodigoErroAsync());
        var linha = await UltimaChamadaAsync(u.Id);
        Assert.Equal("RECUSADA", linha!.Status);
        Assert.Equal(1000, linha.TokensEntrada);
        Assert.Equal(CustoRecusaOpus, linha.CustoUsd);
        Assert.Null(linha.Resultado);
    }

    [Fact]
    public async Task Resposta_cortada_no_max_tokens_vem_marcada_como_truncada()
    {
        var u = await UsuarioComChaveAsync();

        var execucao = await (await ExecutarAsync(u.Http, "resumir-documento", "texto [longo]")).JsonAsync();

        Assert.True(execucao.GetProperty("truncado").GetBoolean());
    }

    [Theory]
    [InlineData("INVALIDA", HttpStatusCode.UnprocessableEntity, "Anthropic.ChaveInvalida")]
    [InlineData("FORA", HttpStatusCode.ServiceUnavailable, "Anthropic.Indisponivel")]
    [InlineData("SEMREDE", HttpStatusCode.ServiceUnavailable, "Anthropic.Indisponivel")] // exceção de rede tratada no catch
    public async Task Falha_da_anthropic_responde_o_codigo_e_grava_erro_sem_custo(string final, HttpStatusCode status, string codigo)
    {
        var u = await UsuarioComChaveAsync(final);

        var resposta = await ExecutarAsync(u.Http, "resumir-documento", "texto");

        Assert.Equal(status, resposta.StatusCode);
        Assert.Equal(codigo, await resposta.CodigoErroAsync());
        var linha = await UltimaChamadaAsync(u.Id);
        Assert.Equal("ERRO", linha!.Status);
        Assert.Equal(codigo, linha.ErroCodigo);
        Assert.Equal(0m, linha.CustoUsd);
    }

    [Fact]
    public async Task Modelo_que_a_anthropic_nao_conhece_vira_pedido_invalido_com_o_detalhe()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var id = $"claude-inexistente-{Guid.NewGuid():N}"[..36];
        (await admin.PostAsJsonAsync("/api/v1/modelos", new { modeloId = id, nomeExibicao = "Fantasma", precoEntradaMTok = 1, precoSaidaMTok = 1 }))
            .EnsureSuccessStatusCode();
        var u = await UsuarioComChaveAsync();

        var resposta = await ExecutarAsync(u.Http, "resumir-documento", "texto", modeloId: id);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resposta.StatusCode);
        Assert.Equal("Anthropic.PedidoInvalido", await resposta.CodigoErroAsync());
        Assert.Contains(id, (await resposta.JsonAsync()).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Sem_chave_responde_422_e_nao_chama_a_anthropic()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);

        var resposta = await ExecutarAsync(usuario, "resumir-documento", "texto");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resposta.StatusCode);
        Assert.Equal("Automacoes.ChaveNaoConfigurada", await resposta.CodigoErroAsync());
        Assert.Equal(0, await TotalChamadasAsync(id));
    }

    [Fact]
    public async Task Modelo_fora_da_tabela_responde_422()
    {
        var u = await UsuarioComChaveAsync();

        var resposta = await ExecutarAsync(u.Http, "resumir-documento", "texto", modeloId: "claude-que-nao-esta-na-tabela");

        Assert.Equal("Automacoes.ModeloInvalido", await resposta.CodigoErroAsync());
        Assert.Equal(0, await TotalChamadasAsync(u.Id));
    }

    [Theory]
    [InlineData("   ", null, "entrada")]
    [InlineData("texto", "relatorio.pdf", "nomeArquivo")]
    public async Task Entrada_invalida_responde_400(string entrada, string? arquivo, string campo)
    {
        var u = await UsuarioComChaveAsync();

        var resposta = await ExecutarAsync(u.Http, "resumir-documento", entrada, nomeArquivo: arquivo);

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.True((await resposta.JsonAsync()).GetProperty("errors").TryGetProperty(campo, out _));
    }

    [Fact]
    public async Task Entrada_acima_de_200_kb_responde_400()
    {
        var u = await UsuarioComChaveAsync();

        var resposta = await ExecutarAsync(u.Http, "resumir-documento", new string('a', 200 * 1024 + 1));

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.True((await resposta.JsonAsync()).GetProperty("errors").TryGetProperty("entrada", out _));
    }

    [Fact]
    public async Task Limite_mensal_avisa_a_partir_de_80_por_cento_e_bloqueia_ao_atingir()
    {
        var u = await UsuarioComChaveAsync();
        (await u.Http.PutAsJsonAsync("/api/v1/configuracoes/preferencias", new { limiteMensalUsd = 0.02m, bloquearAoAtingirLimite = true }))
            .EnsureSuccessStatusCode();

        var primeira = await (await ExecutarAsync(u.Http, "relatorio-executivo", "1")).JsonAsync();
        Assert.False(primeira.TryGetProperty("alertaLimite", out _)); // 72,7% do limite

        var segunda = await (await ExecutarAsync(u.Http, "relatorio-executivo", "2")).JsonAsync();
        var alerta = segunda.GetProperty("alertaLimite");
        Assert.Equal(2 * CustoOpus, alerta.GetProperty("gastoMesUsd").GetDecimal());
        Assert.Equal(145.4m, alerta.GetProperty("percentual").GetDecimal());
        Assert.True(alerta.GetProperty("atingido").GetBoolean());

        var bloqueada = await ExecutarAsync(u.Http, "relatorio-executivo", "3");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, bloqueada.StatusCode);
        Assert.Equal("Automacoes.LimiteMensalAtingido", await bloqueada.CodigoErroAsync());
        Assert.Equal(2, await TotalChamadasAsync(u.Id)); // a bloqueada nem chegou à Anthropic

        // "Só avisar": libera, mas continua avisando
        (await u.Http.PutAsJsonAsync("/api/v1/configuracoes/preferencias", new { limiteMensalUsd = 0.02m, bloquearAoAtingirLimite = false }))
            .EnsureSuccessStatusCode();
        var liberada = await ExecutarAsync(u.Http, "relatorio-executivo", "4");
        Assert.Equal(HttpStatusCode.OK, liberada.StatusCode);
        Assert.True((await liberada.JsonAsync()).GetProperty("alertaLimite").GetProperty("atingido").GetBoolean());
    }

    [Fact]
    public async Task Gasto_de_outro_usuario_nao_conta_no_meu_limite()
    {
        var eu = await UsuarioComChaveAsync();
        var outro = await UsuarioComChaveAsync();
        (await eu.Http.PutAsJsonAsync("/api/v1/configuracoes/preferencias", new { limiteMensalUsd = 0.02m })).EnsureSuccessStatusCode();

        for (var i = 0; i < 3; i++) (await ExecutarAsync(outro.Http, "relatorio-executivo", $"outro {i}")).EnsureSuccessStatusCode();

        var minha = await (await ExecutarAsync(eu.Http, "relatorio-executivo", "minha")).JsonAsync();
        Assert.False(minha.TryGetProperty("alertaLimite", out _));
        Assert.Equal(1, await TotalChamadasAsync(eu.Id));
        Assert.Equal(3, await TotalChamadasAsync(outro.Id));
    }

    [Fact]
    public async Task Admin_edita_a_automacao_e_usuario_comum_nao()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await IdAsync(admin, "resumir-documento");
        var original = (await (await admin.GetAsync(Rota)).JsonAsync()).EnumerateArray()
            .Single(a => a.GetProperty("automacaoId").GetGuid() == id);
        object Corpo(string mensagem, string? modelo) => new
        {
            nome = original.GetProperty("nome").GetString(),
            descricao = original.GetProperty("descricao").GetString(),
            promptSistema = original.GetProperty("promptSistema").GetString(),
            modeloMensagem = mensagem,
            modeloId = modelo,
            maxTokens = 4000,
            ativa = true,
        };

        Assert.Equal(HttpStatusCode.Forbidden, (await usuario.PutAsJsonAsync($"{Rota}/{id}", Corpo("Resuma: {{entrada}}", null))).StatusCode);

        var semMarcador = await admin.PutAsJsonAsync($"{Rota}/{id}", Corpo("Resuma o texto.", null));
        Assert.Equal(HttpStatusCode.BadRequest, semMarcador.StatusCode);
        Assert.True((await semMarcador.JsonAsync()).GetProperty("errors").TryGetProperty("modeloMensagem", out _));

        try
        {
            // Sem modelo na automação e sem modelo padrão no usuário → 422; com modelo padrão → usa o do usuário
            var editada = await admin.PutAsJsonAsync($"{Rota}/{id}", Corpo("Resuma em 3 linhas: {{entrada}}", null));
            Assert.Equal(HttpStatusCode.OK, editada.StatusCode);
            Assert.False((await editada.JsonAsync()).TryGetProperty("modeloId", out _));

            var u = await UsuarioComChaveAsync();
            Assert.Equal("Automacoes.ModeloNaoDefinido", await (await ExecutarAsync(u.Http, "resumir-documento", "x")).CodigoErroAsync());

            (await u.Http.PutAsJsonAsync("/api/v1/configuracoes/preferencias", new { modeloPadraoId = "claude-sonnet-5-5" })).EnsureSuccessStatusCode();
            var execucao = await (await ExecutarAsync(u.Http, "resumir-documento", "texto")).JsonAsync();
            Assert.Equal("claude-sonnet-5-5", execucao.GetProperty("modeloId").GetString());
            var enviado = factory.Anthropic.PedidosDa(u.Chave).Last(p => p.Caminho == "/v1/messages");
            Assert.Equal("Resuma em 3 linhas: texto", enviado.Json!["messages"]![0]!["content"]!.GetValue<string>());
        }
        finally
        {
            // Volta ao original: as outras classes da coleção usam esta automação
            (await admin.PutAsJsonAsync($"{Rota}/{id}", Corpo(original.GetProperty("modeloMensagem").GetString()!, "claude-haiku-5-5")))
                .EnsureSuccessStatusCode();
        }
    }

    private async Task<(Task<HttpResponseMessage> Execucao, Guid ExecucaoId)> ExecutarLentaAsync(HttpClient http, string chave)
    {
        var execucaoId = Guid.NewGuid();
        var id = await IdAsync(http, "resumir-documento");
        var execucao = http.PostAsJsonAsync($"{Rota}/{id}/executar", new { entrada = "Resuma isto [lento]", execucaoId });
        // Espera a chamada chegar na Anthropic (falsa) antes de cancelar
        for (var i = 0; i < 100 && !factory.Anthropic.PedidosDa(chave).Any(p => p.Caminho.EndsWith("/v1/messages", StringComparison.Ordinal)); i++)
            await Task.Delay(50);
        return (execucao, execucaoId);
    }

    [Fact]
    public async Task Cancelar_interrompe_a_execucao_e_grava_a_chamada_como_cancelada()
    {
        var u = await UsuarioComChaveAsync();
        var (execucao, execucaoId) = await ExecutarLentaAsync(u.Http, u.Chave);

        var cancelar = await u.Http.PostAsync($"{Rota}/execucoes/{execucaoId}/cancelar", null);

        Assert.Equal(HttpStatusCode.NoContent, cancelar.StatusCode);
        var resposta = await execucao.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, resposta.StatusCode);
        Assert.Equal("Automacoes.Cancelada", await resposta.CodigoErroAsync());
        var chamada = await UltimaChamadaAsync(u.Id);
        Assert.Equal("CANCELADA", chamada!.Status);
        Assert.Equal("Automacoes.Cancelada", chamada.ErroCodigo);
        Assert.Equal(0, chamada.TokensTotal);
        Assert.Equal(0m, chamada.CustoUsd);
        Assert.Equal(1, await TotalChamadasAsync(u.Id));
    }

    [Fact]
    public async Task Cancelar_o_que_nao_existe_ou_ja_terminou_responde_404()
    {
        var u = await UsuarioComChaveAsync();

        var inexistente = await u.Http.PostAsync($"{Rota}/execucoes/{Guid.NewGuid()}/cancelar", null);
        Assert.Equal(HttpStatusCode.NotFound, inexistente.StatusCode);
        Assert.Equal("Automacoes.ExecucaoNaoEncontrada", await inexistente.CodigoErroAsync());

        var execucaoId = Guid.NewGuid();
        var id = await IdAsync(u.Http, "resumir-documento");
        (await u.Http.PostAsJsonAsync($"{Rota}/{id}/executar", new { entrada = "rápida", execucaoId })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await u.Http.PostAsync($"{Rota}/execucoes/{execucaoId}/cancelar", null)).StatusCode);
    }

    [Fact]
    public async Task So_o_dono_cancela_a_execucao()
    {
        var dono = await UsuarioComChaveAsync();
        var intruso = await factory.ClienteNovoUsuarioAsync();
        var (execucao, execucaoId) = await ExecutarLentaAsync(dono.Http, dono.Chave);

        Assert.Equal(HttpStatusCode.NotFound, (await intruso.PostAsync($"{Rota}/execucoes/{execucaoId}/cancelar", null)).StatusCode);
        Assert.False(execucao.IsCompleted); // a execução do dono segue

        Assert.Equal(HttpStatusCode.NoContent, (await dono.Http.PostAsync($"{Rota}/execucoes/{execucaoId}/cancelar", null)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await execucao.WaitAsync(TimeSpan.FromSeconds(10))).StatusCode);
    }

    [Fact]
    public async Task Execucao_traz_inicio_fim_e_duracao()
    {
        var u = await UsuarioComChaveAsync();

        var json = await (await ExecutarAsync(u.Http, "resumir-documento", "Resuma isto")).JsonAsync();

        var inicio = json.GetProperty("iniciadaEm").GetDateTimeOffset();
        var fim = json.GetProperty("finalizadaEm").GetDateTimeOffset();
        Assert.Equal(inicio.AddMilliseconds(json.GetProperty("duracaoMs").GetInt32()), fim);
        Assert.True(fim >= inicio);
    }

    [Fact]
    public async Task Automacao_inexistente_responde_404()
    {
        var u = await UsuarioComChaveAsync();

        var resposta = await u.Http.PostAsJsonAsync($"{Rota}/{Guid.NewGuid()}/executar", new { entrada = "x" });

        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
        Assert.Equal("Automacoes.NaoEncontrada", await resposta.CodigoErroAsync());
    }
}
