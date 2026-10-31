using AgentDesk.Modules.Sessoes.Domain;

namespace AgentDesk.IntegrationTests.Sessoes;

/// <summary>As 5 regras de dicas são funções puras: testadas sem banco.</summary>
public sealed class DicasTests
{
    private static readonly DateTimeOffset Agora = new(2026, 10, 31, 12, 0, 0, TimeSpan.Zero);

    private static SessaoResumo Sessao(string id = "sessao-abcdef123", long pedidos = 30, long entrada = 1000, long cacheLeitura = 50_000, long cacheEscrita = 1000,
        decimal custo = 10m, string modelo = "claude-sonnet-5-5", int compactacoes = 0, int edicoes = 20)
        => new(Guid.NewGuid(), id, "agent-desk", "a1b2c3d4e5f6", modelo, new UsoCc(pedidos, entrada, 500, cacheLeitura, cacheEscrita, custo),
            Agora.AddHours(-3), Agora, null, compactacoes, edicoes);

    private static UsoDia Dia(int diasAtras, decimal custo, long pedidos = 10)
        => new(DateOnly.FromDateTime(Agora.AddDays(-diasAtras).DateTime), new UsoCc(pedidos, 100, 100, 100, 100, custo));

    private static IReadOnlyList<Dica> Calcular(SessaoResumo? sessao = null, params UsoDia[] dias)
        => RegrasDicas.Calcular(sessao is null ? [] : [sessao], dias);

    [Fact]
    public void Sessao_saudavel_nao_gera_dica()
        => Assert.Empty(Calcular(Sessao()));

    [Fact]
    public void Cache_baixo_numa_sessao_longa()
    {
        // 1.000 + 1.000 de contexto novo e só 500 lidos do cache: 20%
        var dicas = Calcular(Sessao(pedidos: 25, entrada: 1000, cacheLeitura: 500, cacheEscrita: 1000, custo: 20m));

        var dica = Assert.Single(dicas);
        Assert.Equal("CACHE_BAIXO", dica.Regra);
        Assert.Equal("agent-desk", dica.Projeto);
        Assert.Equal(20m * (0.8m - 0.2m) * 0.5m, dica.EconomiaUsd); // estimativa: 30% do custo, neste caso 6
    }

    [Fact]
    public void Cache_baixo_ignora_sessao_curta()
        => Assert.Empty(Calcular(Sessao(pedidos: 19, entrada: 1000, cacheLeitura: 0, cacheEscrita: 1000)));

    [Theory]
    [InlineData(150, 1_000)]          // muitos pedidos
    [InlineData(30, 20_000_000)]      // muitos tokens (entrada enorme; o cache segue alto)
    public void Sessao_gigante(long pedidos, long cacheLeitura)
    {
        var dicas = Calcular(Sessao(pedidos: pedidos, entrada: 10, cacheLeitura: cacheLeitura == 1_000 ? 5_000_000 : cacheLeitura, cacheEscrita: 10, custo: 40m));

        var dica = Assert.Single(dicas, d => d.Regra == "SESSAO_GIGANTE");
        Assert.Equal(10m, dica.EconomiaUsd); // 25% do custo
    }

    [Fact]
    public void Muitas_compactacoes()
    {
        Assert.Empty(Calcular(Sessao(compactacoes: 2)));

        var dica = Assert.Single(Calcular(Sessao(compactacoes: 3, custo: 20m)));
        Assert.Equal("MUITAS_COMPACTACOES", dica.Regra);
        Assert.Equal(3m, dica.EconomiaUsd); // 15% do custo
    }

    [Theory]
    [InlineData("claude-opus-5-5", true)]
    [InlineData("claude-fable-5-1", true)]
    [InlineData("claude-sonnet-5-5", false)]
    [InlineData("claude-haiku-5-5", false)]
    public void Modelo_caro_em_sessao_simples(string modelo, bool esperaDica)
    {
        var dicas = Calcular(Sessao(pedidos: 12, modelo: modelo, edicoes: 2, custo: 10m));

        Assert.Equal(esperaDica, dicas.Any(d => d.Regra == "MODELO_CARO"));
        if (esperaDica) Assert.Equal(6m, dicas.Single(d => d.Regra == "MODELO_CARO").EconomiaUsd);
    }

    [Fact]
    public void Modelo_caro_com_muitas_edicoes_ou_poucos_pedidos_nao_gera_dica()
    {
        Assert.Empty(Calcular(Sessao(pedidos: 12, modelo: "claude-opus-5-5", edicoes: 4)));
        Assert.Empty(Calcular(Sessao(pedidos: 9, modelo: "claude-opus-5-5", edicoes: 0)));
    }

    [Fact]
    public void Dia_fora_da_curva_acima_do_dobro_da_media_dos_outros()
    {
        var dicas = Calcular(null, Dia(4, 2m), Dia(3, 2m), Dia(2, 3m), Dia(1, 2m), Dia(0, 9m));

        var dica = Assert.Single(dicas);
        Assert.Equal("DIA_FORA_DA_CURVA", dica.Regra);
        Assert.Contains("US$ 9,00", dica.Texto);
        Assert.Equal(9m - 2.25m, dica.EconomiaUsd); // custo do dia menos a média dos outros
    }

    [Fact]
    public void Dia_fora_da_curva_precisa_de_historico_e_de_valor_relevante()
    {
        Assert.Empty(Calcular(null, Dia(1, 1m), Dia(0, 50m)));                              // só 2 dias de uso
        Assert.Empty(Calcular(null, Dia(2, 0.1m), Dia(1, 0.1m), Dia(0, 0.5m)));             // 5× a média, mas abaixo de US$ 1
        Assert.Empty(Calcular(null, Dia(2, 2m), Dia(1, 2m), Dia(0, 3.9m)));                 // não passa de 2×
        Assert.Empty(Calcular(null, Dia(3, 2m), Dia(2, 2m), Dia(1, 0m, pedidos: 0), Dia(0, 2m))); // dia sem uso não conta
    }

    [Fact]
    public void Dicas_vem_ordenadas_pela_maior_economia()
    {
        var dicas = Calcular(Sessao(pedidos: 200, compactacoes: 3, custo: 100m, entrada: 10, cacheLeitura: 9_000_000, cacheEscrita: 10));

        Assert.Equal(["SESSAO_GIGANTE", "MUITAS_COMPACTACOES"], dicas.Select(d => d.Regra));
        Assert.True(dicas[0].EconomiaUsd >= dicas[1].EconomiaUsd);
    }
}
