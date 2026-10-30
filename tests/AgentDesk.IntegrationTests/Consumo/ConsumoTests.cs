using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AgentDesk.IntegrationTests.Automacoes;
using AgentDesk.IntegrationTests.Infraestrutura;
using AgentDesk.SharedKernel.Tempo;

namespace AgentDesk.IntegrationTests.Consumo;

[Collection(ApiCollection.Nome)]
public sealed class ConsumoTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/consumo";

    // Automações da carga inicial (ids fixos no schema.sql)
    private static readonly Guid Relatorio = Guid.Parse("a1e5c1a0-0000-4000-8000-000000000001");
    private static readonly Guid Codigo = Guid.Parse("a1e5c1a0-0000-4000-8000-000000000002");
    private static readonly Guid Resumo = Guid.Parse("a1e5c1a0-0000-4000-8000-000000000003");

    /// <summary>Grava uma chamada direto no banco, na data que o teste quiser (o painel agrupa por dia de Brasília).</summary>
    private Task InserirAsync(Guid usuarioId, DateTimeOffset quando, decimal custo, int tokensEntrada = 100, Guid? automacaoId = null,
        string? automacaoNome = null, string modelo = "claude-opus-5-5", string? modeloUsado = null, string status = "SUCESSO")
        => factory.ExecutarAsync("""
            INSERT INTO consumo_chamadas (chamada_id, usuario_id, automacao_id, automacao_nome, modelo_id, modelo_usado,
                                          tokens_entrada, tokens_saida, custo_usd, duracao_ms, status, iniciada_em)
            VALUES (gen_random_uuid(), @UsuarioId, @AutomacaoId, @AutomacaoNome, @Modelo, @ModeloUsado,
                    @TokensEntrada, 10, @Custo, 500, @Status, @Quando)
            """, new
        {
            UsuarioId = usuarioId, AutomacaoId = automacaoId, AutomacaoNome = automacaoNome, Modelo = modelo,
            ModeloUsado = modeloUsado ?? modelo, TokensEntrada = tokensEntrada, Custo = custo, Status = status,
            Quando = quando.ToUniversalTime(),
        });

    private static (DateOnly Hoje, DateTimeOffset InicioHoje) Agora()
    {
        var agora = DateTimeOffset.UtcNow;
        return (FusoBrasil.DataLocal(agora), FusoBrasil.Dia(agora).Inicio);
    }

    private static decimal Custo(JsonElement totais) => totais.GetProperty("custoUsd").GetDecimal();
    private static int Chamadas(JsonElement totais) => totais.GetProperty("chamadas").GetInt32();
    private static string Dia(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    [Fact]
    public async Task Usuario_novo_ve_tudo_zerado_com_os_30_dias_no_grafico()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resumo = await (await usuario.GetAsync($"{Rota}/resumo")).JsonAsync();

        Assert.Equal("MEU", resumo.GetProperty("escopo").GetString());
        Assert.Equal(0, Chamadas(resumo.GetProperty("acumulado")));
        Assert.Equal(30, resumo.GetProperty("porDia").GetArrayLength());
        Assert.Equal(Dia(Agora().Hoje), resumo.GetProperty("porDia")[29].GetProperty("dia").GetString());
        Assert.All(resumo.GetProperty("porDia").EnumerateArray(), d => Assert.Equal(0m, d.GetProperty("custoUsd").GetDecimal()));
        Assert.Equal(0, resumo.GetProperty("ranking").GetArrayLength());
        Assert.False(resumo.TryGetProperty("limiteMensalUsd", out _));
    }

    [Fact]
    public async Task Totais_de_hoje_do_mes_e_acumulado_e_ranking_por_automacao()
    {
        var u = await factory.UsuarioComChaveAsync();
        var (hoje, inicioHoje) = Agora();
        var ontem = hoje.AddDays(-1);
        await InserirAsync(u.Id, inicioHoje.AddSeconds(1), 1.0m, automacaoId: Relatorio, automacaoNome: "Gerar Relatório Executivo");
        await InserirAsync(u.Id, inicioHoje.AddHours(-1), 2.0m, automacaoId: Codigo, automacaoNome: "Analisar Código"); // ontem
        await InserirAsync(u.Id, inicioHoje.AddDays(-40), 4.0m, automacaoId: Codigo, automacaoNome: "Analisar Código"); // fora da janela
        (await u.Http.PutAsJsonAsync("/api/v1/configuracoes/preferencias", new { limiteMensalUsd = 10m })).EnsureSuccessStatusCode();

        var resumo = await (await u.Http.GetAsync($"{Rota}/resumo")).JsonAsync();

        Assert.Equal(1.0m, Custo(resumo.GetProperty("hoje")));
        Assert.Equal(1, Chamadas(resumo.GetProperty("hoje")));
        var mesEsperado = 1.0m + (ontem.Month == hoje.Month ? 2.0m : 0m); // no dia 1º, "ontem" é do mês passado
        Assert.Equal(mesEsperado, Custo(resumo.GetProperty("mes")));
        Assert.Equal(7.0m, Custo(resumo.GetProperty("acumulado")));
        Assert.Equal(3, Chamadas(resumo.GetProperty("acumulado")));
        Assert.Equal(10m, resumo.GetProperty("limiteMensalUsd").GetDecimal());
        Assert.Equal(Math.Round(mesEsperado / 10m * 100m, 1), resumo.GetProperty("percentualLimite").GetDecimal());

        var porDia = resumo.GetProperty("porDia").EnumerateArray().ToDictionary(d => d.GetProperty("dia").GetString()!);
        Assert.Equal(2.0m, porDia[Dia(ontem)].GetProperty("custoUsd").GetDecimal());
        Assert.Equal(1.0m, porDia[Dia(hoje)].GetProperty("custoUsd").GetDecimal());

        // Ranking só da janela (a de 40 dias atrás não entra) e do mais caro para o mais barato
        var ranking = resumo.GetProperty("ranking").EnumerateArray().ToList();
        Assert.Equal(["Analisar Código", "Gerar Relatório Executivo"], ranking.Select(r => r.GetProperty("nome").GetString()));
        Assert.Equal(2.0m, ranking[0].GetProperty("custoUsd").GetDecimal());
    }

    [Fact]
    public async Task Execucao_de_automacao_aparece_no_painel_e_reabre_com_o_resultado()
    {
        var u = await factory.UsuarioComChaveAsync();
        var execucao = await (await AutomacoesTests.ExecutarAsync(u.Http, "relatorio-executivo", "Dados do trimestre")).JsonAsync();
        var chamadaId = execucao.GetProperty("chamadaId").GetGuid();

        var resumo = await (await u.Http.GetAsync($"{Rota}/resumo?dias=7")).JsonAsync();
        Assert.Equal(7, resumo.GetProperty("porDia").GetArrayLength());
        Assert.Equal(AutomacoesTests.CustoOpus, Custo(resumo.GetProperty("hoje")));
        Assert.Equal(1800, resumo.GetProperty("hoje").GetProperty("tokens").GetInt64());

        var detalhe = await u.Http.GetAsync($"{Rota}/chamadas/{chamadaId}");
        Assert.Equal(HttpStatusCode.OK, detalhe.StatusCode);
        var d = await detalhe.JsonAsync();
        Assert.StartsWith("# Resultado falso", d.GetProperty("resultado").GetString());
        Assert.Equal(4m, d.GetProperty("precoEntradaMTok").GetDecimal()); // preço congelado da época
        Assert.Equal("SUCESSO", d.GetProperty("chamada").GetProperty("status").GetString());
        Assert.True(d.GetProperty("chamada").GetProperty("temResultado").GetBoolean());

        // Outro usuário não vê (404, não revela que existe); o ADMIN vê, com o nome de quem rodou
        var outro = await factory.ClienteNovoUsuarioAsync();
        var bloqueado = await outro.GetAsync($"{Rota}/chamadas/{chamadaId}");
        Assert.Equal(HttpStatusCode.NotFound, bloqueado.StatusCode);
        Assert.Equal("Consumo.ChamadaNaoEncontrada", await bloqueado.CodigoErroAsync());
        var admin = await factory.ClienteNovoAdminAsync();
        var visto = await (await admin.GetAsync($"{Rota}/chamadas/{chamadaId}")).JsonAsync();
        Assert.Equal("Usuário de Teste", visto.GetProperty("chamada").GetProperty("usuarioNome").GetString());
    }

    [Fact]
    public async Task Historico_filtra_por_periodo_automacao_modelo_e_status_e_pagina()
    {
        var u = await factory.UsuarioComChaveAsync();
        var outro = await factory.UsuarioComChaveAsync();
        var (hoje, inicioHoje) = Agora();
        await InserirAsync(u.Id, inicioHoje.AddSeconds(10), 0.5m, automacaoId: Relatorio, automacaoNome: "Gerar Relatório Executivo");
        await InserirAsync(u.Id, inicioHoje.AddDays(-2), 0.25m, automacaoId: Resumo, automacaoNome: "Resumir Documento",
            modelo: "claude-opus-5-5", modeloUsado: "claude-sonnet-5-5");
        await InserirAsync(u.Id, inicioHoje.AddDays(-5), 0m, automacaoId: Codigo, automacaoNome: "Analisar Código",
            modelo: "claude-haiku-5-5", status: "ERRO");
        await InserirAsync(outro.Id, inicioHoje.AddSeconds(20), 9m, automacaoId: Relatorio, automacaoNome: "Gerar Relatório Executivo");

        var tudo = await (await u.Http.GetAsync($"{Rota}/chamadas")).JsonAsync();
        Assert.Equal(3, tudo.GetProperty("total").GetInt32()); // a do outro usuário não aparece
        Assert.Equal(0.75m, Custo(tudo.GetProperty("totais")));
        var itens = tudo.GetProperty("itens").EnumerateArray().ToList();
        Assert.Equal("Gerar Relatório Executivo", itens[0].GetProperty("automacaoNome").GetString()); // mais recente primeiro
        Assert.False(itens[0].TryGetProperty("usuarioNome", out _));

        async Task<int> Total(string consulta) => (await (await u.Http.GetAsync($"{Rota}/chamadas?{consulta}")).JsonAsync()).GetProperty("total").GetInt32();
        Assert.Equal(1, await Total($"automacaoId={Codigo}"));
        Assert.Equal(1, await Total("modeloId=claude-sonnet-5-5")); // vale o modelo que respondeu (fallback)
        Assert.Equal(2, await Total("modeloId=claude-opus-5-5"));
        Assert.Equal(1, await Total("status=ERRO"));
        Assert.Equal(1, await Total($"de={Dia(hoje.AddDays(-3))}&ate={Dia(hoje.AddDays(-1))}"));
        Assert.Equal(2, await Total($"de={Dia(hoje.AddDays(-2))}"));

        var pagina2 = await (await u.Http.GetAsync($"{Rota}/chamadas?tamanho=2&pagina=2")).JsonAsync();
        Assert.Equal(1, pagina2.GetProperty("itens").GetArrayLength());
        Assert.Equal(3, pagina2.GetProperty("total").GetInt32());

        var invertido = await u.Http.GetAsync($"{Rota}/chamadas?de={Dia(hoje)}&ate={Dia(hoje.AddDays(-1))}");
        Assert.Equal(HttpStatusCode.BadRequest, invertido.StatusCode);
        Assert.True((await invertido.JsonAsync()).GetProperty("errors").TryGetProperty("de", out _));

        var filtros = await (await u.Http.GetAsync($"{Rota}/filtros")).JsonAsync();
        Assert.Equal(3, filtros.GetProperty("automacoes").GetArrayLength());
        Assert.Equal(["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"],
            filtros.GetProperty("modelos").EnumerateArray().Select(m => m.GetString()));
    }

    [Fact]
    public async Task Escopo_todos_e_so_do_admin_e_soma_todos_os_usuarios()
    {
        var u = await factory.UsuarioComChaveAsync();
        await InserirAsync(u.Id, Agora().InicioHoje.AddSeconds(5), 123.45m);

        var negado = await u.Http.GetAsync($"{Rota}/resumo?escopo=TODOS");
        Assert.Equal(HttpStatusCode.Forbidden, negado.StatusCode);
        Assert.Equal("Consumo.SemPermissao", await negado.CodigoErroAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await u.Http.GetAsync($"{Rota}/chamadas?escopo=TODOS")).StatusCode);

        var admin = await factory.ClienteNovoAdminAsync();
        var meu = await (await admin.GetAsync($"{Rota}/resumo")).JsonAsync();
        Assert.Equal(0m, Custo(meu.GetProperty("acumulado"))); // o ADMIN não gastou nada
        var todos = await (await admin.GetAsync($"{Rota}/resumo?escopo=TODOS")).JsonAsync();
        Assert.Equal("TODOS", todos.GetProperty("escopo").GetString());
        Assert.True(Custo(todos.GetProperty("acumulado")) >= 123.45m);
        Assert.False(todos.TryGetProperty("limiteMensalUsd", out _));

        var historico = await (await admin.GetAsync($"{Rota}/chamadas?escopo=TODOS&tamanho=100")).JsonAsync();
        var minha = historico.GetProperty("itens").EnumerateArray().First(i => i.GetProperty("custoUsd").GetDecimal() == 123.45m);
        Assert.Equal("Usuário de Teste", minha.GetProperty("usuarioNome").GetString());
    }
}
