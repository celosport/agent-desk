using System.Net;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Sessoes;

[Collection(ApiCollection.Nome)]
public sealed class HistoricoSessoesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/sessoes";

    private Task<int> SessaoAsync(Guid usuario, string sessao, string projeto, string chave, int diasAtras = 0, int duracaoMin = 30, int pedidos = 12,
        long entrada = 1000, long saida = 500, long cacheLeitura = 9000, long cacheEscrita = 100, decimal custo = 1.5m, string modelo = "claude-opus-5-5",
        string status = "OCIOSA")
        => factory.ExecutarAsync("""
            INSERT INTO cc_sessoes (usuario_id, sessao_id, maquina, projeto, projeto_chave, status, modelo, pedidos, tokens_entrada, tokens_saida,
                                    tokens_cache_leitura, tokens_cache_escrita, custo_usd, iniciada_em, ultima_atividade_em, encerrada_em)
            VALUES (@Usuario, @Sessao, 'Notebook', @Projeto, @Chave, @Status, @Modelo, @Pedidos, @Entrada, @Saida, @CacheLeitura, @CacheEscrita, @Custo,
                    now() - make_interval(days => @Dias), now() - make_interval(days => @Dias) + make_interval(mins => @Duracao),
                    CASE WHEN @Status = 'ENCERRADA' THEN now() - make_interval(days => @Dias) + make_interval(mins => @Duracao) END)
            """, new { Usuario = usuario, Sessao = sessao, Projeto = projeto, Chave = chave, Status = status, Modelo = modelo, Pedidos = pedidos,
                       Entrada = entrada, Saida = saida, CacheLeitura = cacheLeitura, CacheEscrita = cacheEscrita, Custo = custo, Dias = diasAtras,
                       Duracao = duracaoMin });

    private Task<int> EventoAsync(Guid usuario, string sessao, string tipo, int minutos, string? ferramenta = null, string? resumo = null)
        => factory.ExecutarAsync("""
            INSERT INTO cc_eventos (usuario_id, sessao_id, tipo, ferramenta, resumo, ocorrido_em)
            VALUES (@Usuario, @Sessao, @Tipo, @Ferramenta, @Resumo, now() - interval '1 hour' + make_interval(mins => @Min))
            """, new { Usuario = usuario, Sessao = sessao, Tipo = tipo, Ferramenta = ferramenta, Resumo = resumo, Min = minutos });

    [Fact]
    public async Task Lista_as_sessoes_com_duracao_tokens_custo_e_cache()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);
        await SessaoAsync(id, "s-recente", "agent-desk", "aaaaaaaaaaaa", duracaoMin: 90, pedidos: 12);
        await SessaoAsync(id, "s-antiga", "loja", "bbbbbbbbbbbb", diasAtras: 5, status: "ENCERRADA");

        var pagina = await (await usuario.GetAsync($"{Rota}/historico")).JsonAsync();

        Assert.Equal(2, pagina.GetProperty("total").GetInt32());
        var primeira = pagina.GetProperty("itens")[0];
        Assert.Equal("s-recente", primeira.GetProperty("sessaoId").GetString()); // a mais nova primeiro
        Assert.Equal(90 * 60_000L, primeira.GetProperty("duracaoMs").GetInt64());
        var uso = primeira.GetProperty("uso");
        Assert.Equal(12, uso.GetProperty("pedidos").GetInt64());
        Assert.Equal(1000 + 500 + 9000 + 100, uso.GetProperty("tokens").GetInt64());
        Assert.Equal(1.5m, uso.GetProperty("custoUsd").GetDecimal());
        Assert.Equal(0.891m, uso.GetProperty("taxaCache").GetDecimal()); // 9000 / (1000 + 9000 + 100)
        Assert.Equal("ENCERRADA", pagina.GetProperty("itens")[1].GetProperty("status").GetString());
        var projetos = pagina.GetProperty("projetos").EnumerateArray().Select(p => p.GetProperty("nome").GetString()).ToList();
        Assert.Equal(["agent-desk", "loja"], projetos);
    }

    [Fact]
    public async Task Filtra_por_projeto_e_periodo_e_so_alcanca_90_dias()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);
        await SessaoAsync(id, "a", "agent-desk", "aaaaaaaaaaaa", diasAtras: 0);
        await SessaoAsync(id, "b", "loja", "bbbbbbbbbbbb", diasAtras: 10);
        await SessaoAsync(id, "c", "loja", "bbbbbbbbbbbb", diasAtras: 100);

        async Task<List<string?>> Ids(string consulta)
            => (await (await usuario.GetAsync($"{Rota}/historico{consulta}")).JsonAsync()).GetProperty("itens").EnumerateArray()
                .Select(i => i.GetProperty("sessaoId").GetString()).ToList();

        Assert.Equal(["a", "b"], await Ids("")); // "c" tem 100 dias: fora dos 90
        Assert.Equal(["b"], await Ids("?projeto=bbbbbbbbbbbb"));
        var hoje = DateTime.UtcNow.AddHours(-3).Date;
        Assert.Equal(["b"], await Ids($"?de={hoje.AddDays(-12):yyyy-MM-dd}&ate={hoje.AddDays(-8):yyyy-MM-dd}"));
        Assert.Equal(["b"], await Ids("?pagina=2&tamanho=1"));
    }

    [Fact]
    public async Task Cada_usuario_ve_so_as_proprias_sessoes_e_so_o_admin_ve_todas()
    {
        var ana = await factory.ClienteNovoUsuarioAsync("Ana Paula");
        var bia = await factory.ClienteNovoUsuarioAsync();
        var admin = await factory.ClienteNovoAdminAsync();
        await SessaoAsync(await AgentDeskApiFactory.IdAsync(ana), "da-ana", "agent-desk", "aaaaaaaaaaaa");

        Assert.Equal(0, (await (await bia.GetAsync($"{Rota}/historico")).JsonAsync()).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await bia.GetAsync($"{Rota}/historico?escopo=TODOS")).StatusCode);

        var todos = await (await admin.GetAsync($"{Rota}/historico?escopo=TODOS&tamanho=100")).JsonAsync();
        var daAna = todos.GetProperty("itens").EnumerateArray().Single(i => i.GetProperty("sessaoId").GetString() == "da-ana");
        Assert.Equal("Ana Paula", daAna.GetProperty("usuarioNome").GetString());
        Assert.Equal(0, (await (await admin.GetAsync($"{Rota}/historico")).JsonAsync()).GetProperty("total").GetInt32()); // "Meu" do admin
    }

    [Fact]
    public async Task Linha_do_tempo_mostra_o_que_a_sessao_fez_em_ordem_de_hora()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);
        await SessaoAsync(id, "com-eventos", "agent-desk", "aaaaaaaaaaaa");
        await EventoAsync(id, "com-eventos", "Stop", 30);
        await EventoAsync(id, "com-eventos", "SessionStart", 0);
        await EventoAsync(id, "com-eventos", "PreToolUse", 10, "Read", "api.ts");
        await factory.ExecutarAsync("""
            INSERT INTO cc_eventos (usuario_id, sessao_id, tipo, modelo, tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita, custo_usd, ocorrido_em)
            VALUES (@U, 'com-eventos', 'api_request', 'claude-opus-5-5', 100, 50, 800, 50, 0.25, now() - interval '1 hour' + interval '20 minutes')
            """, new { U = id });

        var linha = await (await usuario.GetAsync($"{Rota}/historico/com-eventos")).JsonAsync();

        Assert.Equal("agent-desk", linha.GetProperty("sessao").GetProperty("projeto").GetString());
        Assert.False(linha.GetProperty("cortada").GetBoolean());
        var eventos = linha.GetProperty("eventos").EnumerateArray().ToList();
        Assert.Equal(["SessionStart", "PreToolUse", "api_request", "Stop"], eventos.Select(e => e.GetProperty("tipo").GetString()));
        Assert.Equal("Read", eventos[1].GetProperty("ferramenta").GetString());
        Assert.Equal("api.ts", eventos[1].GetProperty("resumo").GetString());
        Assert.Equal(1000, eventos[2].GetProperty("tokens").GetInt64());
        Assert.Equal(0.25m, eventos[2].GetProperty("custoUsd").GetDecimal());
        Assert.False(eventos[1].TryGetProperty("tokens", out _));
    }

    [Fact]
    public async Task Linha_do_tempo_de_outro_usuario_ou_inexistente_responde_404_e_o_admin_abre_qualquer_uma()
    {
        var ana = await factory.ClienteNovoUsuarioAsync();
        var bia = await factory.ClienteNovoUsuarioAsync();
        var admin = await factory.ClienteNovoAdminAsync();
        var sessao = $"privada-{Guid.NewGuid():N}";
        await SessaoAsync(await AgentDeskApiFactory.IdAsync(ana), sessao, "agent-desk", "aaaaaaaaaaaa");

        var negada = await bia.GetAsync($"{Rota}/historico/{sessao}");
        Assert.Equal(HttpStatusCode.NotFound, negada.StatusCode);
        Assert.Equal("Sessoes.NaoEncontrada", await negada.CodigoErroAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await ana.GetAsync($"{Rota}/historico/nao-existe")).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"{Rota}/historico/{sessao}")).StatusCode); // "Meu" do admin
        var doAdmin = await admin.GetAsync($"{Rota}/historico/{sessao}?escopo=TODOS");
        Assert.Equal(HttpStatusCode.OK, doAdmin.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bia.GetAsync($"{Rota}/historico/{sessao}?escopo=TODOS")).StatusCode);
    }

    [Fact]
    public async Task Dicas_olham_os_ultimos_7_dias_e_so_do_proprio_usuario()
    {
        var ana = await factory.ClienteNovoUsuarioAsync();
        var bia = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(ana);
        // Sessão longa com cache de 10%: dica de cache baixo; e uma sessão de 20 dias atrás que não entra na janela
        await SessaoAsync(id, "cara-e-sem-cache", "agent-desk", "aaaaaaaaaaaa", pedidos: 40, entrada: 9000, cacheLeitura: 1000, cacheEscrita: 0, custo: 30m, modelo: "claude-sonnet-5-5");
        await SessaoAsync(id, "velha", "agent-desk", "aaaaaaaaaaaa", diasAtras: 20, pedidos: 500, custo: 99m);
        // 3 compactações; o modelo é Sonnet (não é caro), então não há dica de modelo mesmo com 0 edições
        await EventoAsync(id, "cara-e-sem-cache", "PreCompact", 1);
        await EventoAsync(id, "cara-e-sem-cache", "PreCompact", 2);
        await EventoAsync(id, "cara-e-sem-cache", "PreCompact", 3);

        var dicas = await (await ana.GetAsync($"{Rota}/dicas")).JsonAsync();

        var regras = dicas.GetProperty("dicas").EnumerateArray().Select(d => d.GetProperty("regra").GetString()).Order().ToList();
        Assert.Equal(["CACHE_BAIXO", "MUITAS_COMPACTACOES"], regras);
        Assert.Equal(7, dicas.GetProperty("dias").GetInt32());
        Assert.Equal(30m * (0.8m - 0.1m) * 0.5m + 30m * 0.15m, dicas.GetProperty("economiaTotalUsd").GetDecimal());
        Assert.Equal(0, (await (await bia.GetAsync($"{Rota}/dicas")).JsonAsync()).GetProperty("dicas").GetArrayLength());
        Assert.Equal(HttpStatusCode.Forbidden, (await bia.GetAsync($"{Rota}/dicas?escopo=TODOS")).StatusCode);
    }
}
