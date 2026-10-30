using System.Net;
using System.Net.Http.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Configuracoes;

[Collection(ApiCollection.Nome)]
public sealed class ConfiguracoesTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/configuracoes";

    [Fact]
    public async Task Usuario_novo_recebe_o_padrao()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var config = await (await usuario.GetAsync(Rota)).JsonAsync();

        Assert.False(config.GetProperty("chaveApiConfigurada").GetBoolean());
        Assert.False(config.TryGetProperty("chaveApiMascarada", out _)); // nulos são omitidos
        Assert.False(config.TryGetProperty("limiteMensalUsd", out _));
        Assert.True(config.GetProperty("bloquearAoAtingirLimite").GetBoolean());
    }

    [Fact]
    public async Task Salva_a_chave_cifrada_e_so_devolve_a_versao_mascarada()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var chave = AnthropicFalso.NovaChave("WXYZ");

        var salvar = await usuario.PutAsJsonAsync($"{Rota}/chave-api", new { chaveApi = $"  {chave}  " });

        Assert.Equal(HttpStatusCode.OK, salvar.StatusCode);
        var corpo = await salvar.Content.ReadAsStringAsync();
        Assert.DoesNotContain(chave, corpo);
        var config = await salvar.JsonAsync();
        Assert.True(config.GetProperty("chaveApiConfigurada").GetBoolean());
        Assert.Equal("sk-ant-...WXYZ", config.GetProperty("chaveApiMascarada").GetString());

        var lida = await usuario.GetAsync(Rota);
        Assert.DoesNotContain(chave, await lida.Content.ReadAsStringAsync());
        Assert.Equal("sk-ant-...WXYZ", (await lida.JsonAsync()).GetProperty("chaveApiMascarada").GetString());

        // No banco: cifrada (nada da chave em claro além dos 4 últimos) e o anel do Data Protection guardado no Postgres
        var cifrada = await factory.ConsultarAsync<string>(
            "SELECT chave_api_cifrada FROM configuracoes_usuario WHERE chave_api_final = 'WXYZ' ORDER BY atualizado_em DESC LIMIT 1");
        Assert.NotNull(cifrada);
        Assert.DoesNotContain("sk-ant-", cifrada);
        Assert.True(await factory.ConsultarAsync<long>("SELECT COUNT(*) FROM chaves_protecao_dados") >= 1);
    }

    [Theory]
    [InlineData("")]
    [InlineData("chave-sem-prefixo-1234567890")]
    [InlineData("sk-ant-curta")]
    [InlineData("sk-ant-com espaco-no-meio-1234567")]
    public async Task Chave_mal_formada_responde_400(string chave)
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resposta = await usuario.PutAsJsonAsync($"{Rota}/chave-api", new { chaveApi = chave });

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.True((await resposta.JsonAsync()).GetProperty("errors").TryGetProperty("chaveApi", out _));
    }

    [Fact]
    public async Task Testar_sem_chave_responde_422()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resposta = await usuario.PostAsync($"{Rota}/chave-api/testar", null);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resposta.StatusCode);
        Assert.Equal("Configuracoes.ChaveNaoConfigurada", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Testar_chave_valida_chama_a_anthropic_com_a_chave_salva_sem_gastar_tokens()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var chave = AnthropicFalso.NovaChave();
        await usuario.PutAsJsonAsync($"{Rota}/chave-api", new { chaveApi = chave });

        var resposta = await usuario.PostAsync($"{Rota}/chave-api/testar", null);

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.True((await resposta.JsonAsync()).GetProperty("valida").GetBoolean());
        var pedido = Assert.Single(factory.Anthropic.PedidosDa(chave));
        Assert.Equal(HttpMethod.Get, pedido.Metodo);
        Assert.Equal("/v1/models?limit=1", pedido.Caminho);
        Assert.Equal("2026-10-21", pedido.Versao);
    }

    [Theory]
    [InlineData("INVALIDA", HttpStatusCode.UnprocessableEntity, "Anthropic.ChaveInvalida")]
    [InlineData("LIMITE", HttpStatusCode.ServiceUnavailable, "Anthropic.LimiteDeTaxa")]
    [InlineData("FORA", HttpStatusCode.ServiceUnavailable, "Anthropic.Indisponivel")]
    [InlineData("SEMREDE", HttpStatusCode.ServiceUnavailable, "Anthropic.Indisponivel")] // exceção de rede tratada no catch
    public async Task Falhas_da_anthropic_viram_codigo_estavel(string final, HttpStatusCode status, string codigo)
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        await usuario.PutAsJsonAsync($"{Rota}/chave-api", new { chaveApi = AnthropicFalso.NovaChave(final) });

        var resposta = await usuario.PostAsync($"{Rota}/chave-api/testar", null);

        Assert.Equal(status, resposta.StatusCode);
        Assert.Equal(codigo, await resposta.CodigoErroAsync());
        Assert.NotEqual("Erro interno.", (await resposta.JsonAsync()).GetProperty("title").GetString()); // 503 mostra a mensagem
    }

    [Fact]
    public async Task Remover_apaga_a_chave()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        await usuario.PutAsJsonAsync($"{Rota}/chave-api", new { chaveApi = AnthropicFalso.NovaChave() });

        var removida = await usuario.DeleteAsync($"{Rota}/chave-api");

        Assert.Equal(HttpStatusCode.OK, removida.StatusCode);
        Assert.False((await removida.JsonAsync()).GetProperty("chaveApiConfigurada").GetBoolean());
        Assert.Equal("Configuracoes.ChaveNaoConfigurada", await (await usuario.PostAsync($"{Rota}/chave-api/testar", null)).CodigoErroAsync());
    }

    [Fact]
    public async Task Chave_que_nao_decifra_mais_aparece_como_nao_configurada()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        await usuario.PutAsJsonAsync($"{Rota}/chave-api", new { chaveApi = AnthropicFalso.NovaChave("QUEB") });
        // Simula o anel de chaves perdido: o texto cifrado deixa de ser legível (o catch do CofreChaves trata)
        await factory.ExecutarAsync("UPDATE configuracoes_usuario SET chave_api_cifrada = 'lixo-ilegivel' WHERE chave_api_final = 'QUEB'");

        var config = await (await usuario.GetAsync(Rota)).JsonAsync();

        Assert.False(config.GetProperty("chaveApiConfigurada").GetBoolean());
        Assert.Equal("Configuracoes.ChaveNaoConfigurada", await (await usuario.PostAsync($"{Rota}/chave-api/testar", null)).CodigoErroAsync());
    }

    [Fact]
    public async Task Salva_modelo_padrao_e_limite_mensal()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resposta = await usuario.PutAsJsonAsync($"{Rota}/preferencias",
            new { modeloPadraoId = "claude-opus-5-5", limiteMensalUsd = 50.5m, bloquearAoAtingirLimite = false });

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        var config = await (await usuario.GetAsync(Rota)).JsonAsync();
        Assert.Equal("claude-opus-5-5", config.GetProperty("modeloPadraoId").GetString());
        Assert.Equal(50.5m, config.GetProperty("limiteMensalUsd").GetDecimal());
        Assert.False(config.GetProperty("bloquearAoAtingirLimite").GetBoolean());
    }

    [Fact]
    public async Task Modelo_inexistente_responde_422_e_limite_zero_responde_400()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var modelo = await usuario.PutAsJsonAsync($"{Rota}/preferencias", new { modeloPadraoId = "claude-que-nao-existe" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, modelo.StatusCode);
        Assert.Equal("Configuracoes.ModeloInvalido", await modelo.CodigoErroAsync());

        var limite = await usuario.PutAsJsonAsync($"{Rota}/preferencias", new { limiteMensalUsd = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, limite.StatusCode);
        Assert.True((await limite.JsonAsync()).GetProperty("errors").TryGetProperty("limiteMensalUsd", out _));
    }

    [Fact]
    public async Task Cada_usuario_so_ve_e_usa_a_propria_chave()
    {
        var dona = await factory.ClienteNovoUsuarioAsync();
        var outro = await factory.ClienteNovoUsuarioAsync();
        await dona.PutAsJsonAsync($"{Rota}/chave-api", new { chaveApi = AnthropicFalso.NovaChave() });

        Assert.False((await (await outro.GetAsync(Rota)).JsonAsync()).GetProperty("chaveApiConfigurada").GetBoolean());
        Assert.Equal("Configuracoes.ChaveNaoConfigurada", await (await outro.PostAsync($"{Rota}/chave-api/testar", null)).CodigoErroAsync());
    }

    [Fact]
    public async Task Sem_token_responde_401()
    {
        var resposta = await factory.CreateClient().GetAsync(Rota);
        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);
    }
}
