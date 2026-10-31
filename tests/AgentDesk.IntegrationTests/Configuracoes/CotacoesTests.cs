using System.Net;
using AgentDesk.IntegrationTests.Infraestrutura;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.Modules.Configuracoes.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace AgentDesk.IntegrationTests.Configuracoes;

[Collection(ApiCollection.Nome)]
public sealed class CotacoesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/cotacoes";

    private static readonly DateOnly Dia = new(2026, 10, 29);
    private static readonly DateTimeOffset Agora = new(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);

    private Task LimparAsync() => factory.ExecutarAsync("DELETE FROM cotacoes_moeda");

    private async Task SalvarAsync(string moeda, decimal brl, DateOnly? dia = null)
    {
        using var escopo = factory.Services.CreateScope();
        await escopo.ServiceProvider.GetRequiredService<ICotacoesRepository>()
            .SalvarAsync(new CotacaoBrl(moeda, brl, dia ?? Dia, Agora), CancellationToken.None);
    }

    // ---- leitura do Banco Central (formato real da API PTAX) ----

    private const string BoletinsBcb = """
        {"@odata.context":"https://x/odata$metadata#_CotacaoMoedaDia","value":[
          {"paridadeCompra":1.0,"paridadeVenda":1.0,"cotacaoCompra":5.3484,"cotacaoVenda":5.3490,"dataHoraCotacao":"2026-10-29 10:10:54.921","tipoBoletim":"Abertura"},
          {"paridadeCompra":1.0,"paridadeVenda":1.0,"cotacaoCompra":5.3862,"cotacaoVenda":5.3868,"dataHoraCotacao":"2026-10-29 12:05:12.74","tipoBoletim":"Intermediário"},
          {"paridadeCompra":1.0,"paridadeVenda":1.0,"cotacaoCompra":5.4010,"cotacaoVenda":5.4016,"dataHoraCotacao":"2026-10-29 13:06:00.1","tipoBoletim":"Fechamento"}
        ]}
        """;

    [Fact]
    public void Le_a_venda_do_boletim_de_fechamento()
        => Assert.Equal(5.4016m, ClienteBcb.LerVenda(BoletinsBcb));

    [Fact]
    public void Sem_fechamento_usa_o_ultimo_boletim_do_dia()
        => Assert.Equal(5.3868m, ClienteBcb.LerVenda("""{"value":[{"cotacaoVenda":5.3490,"tipoBoletim":"Abertura"},{"cotacaoVenda":5.3868,"tipoBoletim":"Intermediário"}]}"""));

    [Theory]
    [InlineData("""{"value":[]}""")]                          // feriado ou fim de semana
    [InlineData("""{"value":[{"cotacaoVenda":0}]}""")]
    [InlineData("""{"value":[{"cotacaoVenda":"x"}]}""")]
    [InlineData("""{"outra":1}""")]
    [InlineData("não é json")]
    public void Dia_sem_cotacao_ou_formato_diferente_nao_quebra(string json)
        => Assert.Null(ClienteBcb.LerVenda(json));

    // ---- conversão: tudo parte do dólar ----

    [Fact]
    public void Taxas_por_dolar_saem_da_PTAX_em_reais()
    {
        var taxas = Conversao.PorDolar([
            new CotacaoBrl("USD", 6.0m, Dia, Agora),
            new CotacaoBrl("EUR", 7.5m, Dia, Agora),
            new CotacaoBrl("GBP", 8.0m, Dia.AddDays(-1), Agora.AddHours(-1)),
        ])!;

        Assert.Equal(1m, taxas.Taxas["USD"]);
        Assert.Equal(6.0m, taxas.Taxas["BRL"]);
        Assert.Equal(0.8m, taxas.Taxas["EUR"]);    // 1 US$ = 6,00 R$ = 0,80 €
        Assert.Equal(0.75m, taxas.Taxas["GBP"]);
        Assert.Equal(Dia.AddDays(-1), taxas.DataCotacao); // a mais antiga usada
    }

    [Fact]
    public void Sem_o_dolar_nao_ha_conversao_e_euro_ou_libra_ausentes_ficam_de_fora()
    {
        Assert.Null(Conversao.PorDolar([new CotacaoBrl("EUR", 7.5m, Dia, Agora)]));
        Assert.Null(Conversao.PorDolar([]));

        var so = Conversao.PorDolar([new CotacaoBrl("USD", 5m, Dia, Agora)])!;
        Assert.Equal(["USD", "BRL"], so.Taxas.Keys);
    }

    // ---- a rotina ----

    private sealed class ClienteFalso(Func<string, (decimal, DateOnly)?> resposta) : IClienteCotacoes
    {
        public List<string> Moedas { get; } = [];

        public Task<(decimal BrlPorUnidade, DateOnly Data)?> UltimaAsync(string moeda, DateOnly hoje, CancellationToken cancellationToken)
        {
            Moedas.Add(moeda);
            return Task.FromResult(resposta(moeda));
        }
    }

    private CotacoesRotina Rotina(IClienteCotacoes cliente)
    {
        using var escopo = factory.Services.CreateScope();
        var servicos = new ServiceCollection();
        servicos.AddSingleton(cliente);
        servicos.AddSingleton(escopo.ServiceProvider.GetRequiredService<ICotacoesRepository>());
        return new CotacoesRotina(servicos.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>(), TimeProvider.System,
            NullLogger<CotacoesRotina>.Instance);
    }

    [Fact]
    public async Task Rotina_busca_dolar_euro_e_libra_e_grava_com_a_data()
    {
        await LimparAsync();
        var cliente = new ClienteFalso(moeda => moeda switch { "USD" => (5.4m, Dia), "EUR" => (6.0m, Dia), _ => (7.2m, Dia) });

        var atualizadas = await Rotina(cliente).ExecutarUmaVezAsync(CancellationToken.None);

        Assert.Equal(3, atualizadas);
        Assert.Equal(["USD", "EUR", "GBP"], cliente.Moedas);
        Assert.Equal(5.4m, await factory.ConsultarAsync<decimal>("SELECT brl_por_unidade FROM cotacoes_moeda WHERE moeda = 'USD'"));
        Assert.Equal(Dia, await factory.ConsultarAsync<DateOnly>("SELECT data_cotacao FROM cotacoes_moeda WHERE moeda = 'GBP'"));
    }

    [Fact]
    public async Task Falha_em_uma_moeda_nao_impede_as_outras_nem_derruba_a_rotina()
    {
        await LimparAsync();
        var cliente = new ClienteFalso(moeda => moeda == "EUR" ? throw new HttpRequestException("BCB fora do ar") : (5m, Dia));

        var atualizadas = await Rotina(cliente).ExecutarUmaVezAsync(CancellationToken.None);

        Assert.Equal(2, atualizadas);
        Assert.Equal(2, await factory.ConsultarAsync<long>("SELECT COUNT(*) FROM cotacoes_moeda"));
    }

    [Fact]
    public async Task Moeda_sem_cotacao_nos_ultimos_dias_e_pulada()
    {
        await LimparAsync();

        var atualizadas = await Rotina(new ClienteFalso(moeda => moeda == "USD" ? (5m, Dia) : null)).ExecutarUmaVezAsync(CancellationToken.None);

        Assert.Equal(1, atualizadas);
    }

    [Fact]
    public async Task Cotacao_mais_antiga_nunca_substitui_a_mais_nova()
    {
        await LimparAsync();
        await SalvarAsync("USD", 5.5m, Dia);

        await SalvarAsync("USD", 4.0m, Dia.AddDays(-3));
        Assert.Equal(5.5m, await factory.ConsultarAsync<decimal>("SELECT brl_por_unidade FROM cotacoes_moeda WHERE moeda = 'USD'"));

        await SalvarAsync("USD", 5.6m, Dia.AddDays(1));
        Assert.Equal(5.6m, await factory.ConsultarAsync<decimal>("SELECT brl_por_unidade FROM cotacoes_moeda WHERE moeda = 'USD'"));
    }

    // ---- API ----

    [Fact]
    public async Task Sem_cotacao_guardada_responde_503_e_o_app_segue_em_dolar()
    {
        await LimparAsync();
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resposta = await usuario.GetAsync(Rota);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, resposta.StatusCode);
        Assert.Equal("Cotacoes.Indisponivel", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Devolve_as_taxas_por_dolar_com_fonte_e_data()
    {
        await LimparAsync();
        await SalvarAsync("USD", 5.4m);
        await SalvarAsync("EUR", 6.0m);
        await SalvarAsync("GBP", 7.2m);
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var cotacoes = await (await usuario.GetAsync(Rota)).JsonAsync();

        Assert.Equal("USD", cotacoes.GetProperty("base").GetString());
        var taxas = cotacoes.GetProperty("taxas");
        Assert.Equal(1m, taxas.GetProperty("USD").GetDecimal());
        Assert.Equal(5.4m, taxas.GetProperty("BRL").GetDecimal());
        Assert.Equal(0.9m, taxas.GetProperty("EUR").GetDecimal());
        Assert.Equal(0.75m, taxas.GetProperty("GBP").GetDecimal());
        Assert.Equal("2026-10-29", cotacoes.GetProperty("dataCotacao").GetString());
        Assert.Contains("Banco Central", cotacoes.GetProperty("fonte").GetString());
    }

    [Fact]
    public async Task Cotacoes_exigem_login()
        => Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(Rota)).StatusCode);
}
