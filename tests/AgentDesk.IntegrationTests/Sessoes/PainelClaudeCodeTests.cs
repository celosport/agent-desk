using System.Net;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Sessoes;

[Collection(ApiCollection.Nome)]
public sealed class PainelClaudeCodeTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/sessoes/painel";

    /// <summary>Uma linha de cc_consumo_diario; <paramref name="diasAtras"/> conta no calendário de Brasília.</summary>
    private Task<int> UsoAsync(Guid usuario, int diasAtras, string projeto, string modelo, int pedidos, long entrada, long saida,
        long cacheLeitura, long cacheEscrita, decimal custo)
        => factory.ExecutarAsync("""
            INSERT INTO cc_consumo_diario (usuario_id, dia, projeto, modelo, pedidos, tokens_entrada, tokens_saida, tokens_cache_leitura,
                                           tokens_cache_escrita, custo_usd)
            VALUES (@Usuario, (now() AT TIME ZONE 'America/Sao_Paulo')::date - @Dias, @Projeto, @Modelo, @Pedidos, @Entrada, @Saida,
                    @CacheLeitura, @CacheEscrita, @Custo)
            """, new { Usuario = usuario, Dias = diasAtras, Projeto = projeto, Modelo = modelo, Pedidos = pedidos, Entrada = entrada,
                       Saida = saida, CacheLeitura = cacheLeitura, CacheEscrita = cacheEscrita, Custo = custo });

    private Task<int> FerramentaAsync(Guid usuario, string ferramenta, int vezes)
        => factory.ExecutarAsync("""
            INSERT INTO cc_eventos (usuario_id, sessao_id, tipo, ferramenta, ocorrido_em)
            SELECT @Usuario, 'painel-teste', 'PreToolUse', @Ferramenta, now() FROM generate_series(1, @Vezes)
            """, new { Usuario = usuario, Ferramenta = ferramenta, Vezes = vezes });

    [Fact]
    public async Task Sem_uso_o_painel_vem_zerado_com_todos_os_dias_do_grafico()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var painel = await (await usuario.GetAsync(Rota)).JsonAsync();

        Assert.Equal("MEU", painel.GetProperty("escopo").GetString());
        Assert.Equal(0, painel.GetProperty("acumulado").GetProperty("tokens").GetInt64());
        Assert.False(painel.GetProperty("hoje").TryGetProperty("taxaCache", out _)); // sem contexto, sem taxa (a API omite nulos)
        Assert.Equal(30, painel.GetProperty("serie").GetArrayLength());
        Assert.Equal(0, painel.GetProperty("projetos").GetArrayLength());
        Assert.Equal(0, painel.GetProperty("ferramentas").GetArrayLength());
    }

    [Fact]
    public async Task Soma_hoje_mes_e_acumulado_e_ranqueia_projetos_e_modelos_pelo_custo()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);
        await UsoAsync(id, 0, "agent-desk", "claude-opus-5-5", 10, 1000, 500, 100, 0, 2.00m);
        await UsoAsync(id, 0, "loja", "claude-sonnet-5-5", 6, 200, 100, 9000, 800, 0.50m);
        await UsoAsync(id, 100, "antigo", "claude-opus-5-5", 3, 10, 10, 10, 10, 9.00m); // fora da janela de 30 dias, entra no acumulado

        var painel = await (await usuario.GetAsync(Rota)).JsonAsync();

        var hoje = painel.GetProperty("hoje");
        Assert.Equal(16, hoje.GetProperty("pedidos").GetInt64());
        Assert.Equal(1000 + 500 + 100 + 200 + 100 + 9000 + 800, hoje.GetProperty("tokens").GetInt64());
        Assert.Equal(2.50m, hoje.GetProperty("custoUsd").GetDecimal());
        Assert.Equal(16, painel.GetProperty("mes").GetProperty("pedidos").GetInt64());
        Assert.Equal(19, painel.GetProperty("acumulado").GetProperty("pedidos").GetInt64());

        var projetos = painel.GetProperty("projetos").EnumerateArray().Select(p => p.GetProperty("nome").GetString()).ToList();
        Assert.Equal(["agent-desk", "loja"], projetos); // do mais caro; "antigo" está fora da janela
        var modelos = painel.GetProperty("modelos").EnumerateArray().Select(p => p.GetProperty("nome").GetString()).ToList();
        Assert.Equal(["claude-opus-5-5", "claude-sonnet-5-5"], modelos);

        var ultimoDia = painel.GetProperty("serie")[29];
        Assert.Equal(16, ultimoDia.GetProperty("uso").GetProperty("pedidos").GetInt64());
        Assert.Equal(0, painel.GetProperty("serie")[0].GetProperty("uso").GetProperty("pedidos").GetInt64());
    }

    [Fact]
    public async Task Taxa_de_cache_destaca_projeto_com_cache_baixo_e_ignora_amostra_pequena()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);
        await UsoAsync(id, 0, "desperdicio", "claude-opus-5-5", 10, 1000, 0, 100, 0, 1m);     // 100 / 1.100 = 9,1%
        await UsoAsync(id, 0, "economico", "claude-opus-5-5", 10, 100, 0, 900, 0, 1m);       // 900 / 1.000 = 90%
        await UsoAsync(id, 0, "poucos-pedidos", "claude-opus-5-5", 2, 1000, 0, 0, 0, 1m);    // 0%, mas só 2 pedidos

        var projetos = (await (await usuario.GetAsync(Rota)).JsonAsync()).GetProperty("projetos").EnumerateArray()
            .ToDictionary(p => p.GetProperty("nome").GetString()!, p => p.GetProperty("uso"));

        Assert.Equal(0.091m, projetos["desperdicio"].GetProperty("taxaCache").GetDecimal());
        Assert.True(projetos["desperdicio"].GetProperty("cacheBaixo").GetBoolean());
        Assert.Equal(0.9m, projetos["economico"].GetProperty("taxaCache").GetDecimal());
        Assert.False(projetos["economico"].GetProperty("cacheBaixo").GetBoolean());
        Assert.False(projetos["poucos-pedidos"].GetProperty("cacheBaixo").GetBoolean());
    }

    [Fact]
    public async Task Ferramentas_mais_usadas_vem_da_contagem_dos_hooks()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);
        await FerramentaAsync(id, "Read", 5);
        await FerramentaAsync(id, "Bash", 3);
        await FerramentaAsync(id, "Edit", 7);

        var ferramentas = (await (await usuario.GetAsync(Rota)).JsonAsync()).GetProperty("ferramentas").EnumerateArray()
            .Select(f => (f.GetProperty("ferramenta").GetString(), f.GetProperty("usos").GetInt64())).ToList();

        Assert.Equal([("Edit", 7L), ("Read", 5L), ("Bash", 3L)], ferramentas);
    }

    [Fact]
    public async Task Cada_usuario_ve_so_o_proprio_uso_e_dias_fora_do_intervalo_sao_ajustados()
    {
        var ana = await factory.ClienteNovoUsuarioAsync();
        var bia = await factory.ClienteNovoUsuarioAsync();
        await UsoAsync(await AgentDeskApiFactory.IdAsync(ana), 0, "da-ana", "claude-opus-5-5", 1, 1, 1, 1, 1, 1m);

        var daBia = await (await bia.GetAsync($"{Rota}?dias=1000")).JsonAsync();

        Assert.Equal(0, daBia.GetProperty("acumulado").GetProperty("pedidos").GetInt64());
        Assert.Equal(90, daBia.GetProperty("dias").GetInt32()); // limitado a 90
        Assert.Equal(90, daBia.GetProperty("serie").GetArrayLength());
    }

    [Fact]
    public async Task Escopo_todos_e_so_do_admin_e_soma_os_usuarios()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var admin = await factory.ClienteNovoAdminAsync();
        await UsoAsync(await AgentDeskApiFactory.IdAsync(usuario), 0, "p", "claude-opus-5-5", 7, 1, 1, 1, 1, 1m);
        await UsoAsync(await AgentDeskApiFactory.IdAsync(admin), 0, "p", "claude-opus-5-5", 5, 1, 1, 1, 1, 1m);

        var negado = await usuario.GetAsync($"{Rota}?escopo=TODOS");
        Assert.Equal(HttpStatusCode.Forbidden, negado.StatusCode);
        Assert.Equal("Sessoes.SemPermissao", await negado.CodigoErroAsync());

        var meu = await (await admin.GetAsync(Rota)).JsonAsync();
        var todos = await (await admin.GetAsync($"{Rota}?escopo=TODOS")).JsonAsync();
        Assert.Equal(5, meu.GetProperty("hoje").GetProperty("pedidos").GetInt64());
        Assert.Equal("TODOS", todos.GetProperty("escopo").GetString());
        Assert.True(todos.GetProperty("hoje").GetProperty("pedidos").GetInt64() >= 12);
    }

    [Fact]
    public async Task Painel_exige_login()
        => Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(Rota)).StatusCode);
}
