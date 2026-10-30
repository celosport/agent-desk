using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Configuracoes;

[Collection(ApiCollection.Nome)]
public sealed class ModelosTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/modelos";

    private static string NovoId() => $"claude-teste-{Guid.NewGuid():N}"[..40];

    private static object NovoModelo(string id) => new
    {
        modeloId = id, nomeExibicao = "Claude de Teste", precoEntradaMTok = 1.25m, precoSaidaMTok = 6.5m, precoCacheLeituraMTok = 0.125m,
    };

    private static JsonElement? Achar(JsonElement lista, string id)
        => lista.EnumerateArray().Cast<JsonElement?>().FirstOrDefault(m => m!.Value.GetProperty("modeloId").GetString() == id);

    [Fact]
    public async Task Tabela_ja_vem_com_os_modelos_atuais()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var lista = await (await usuario.GetAsync(Rota)).JsonAsync();

        foreach (var id in new[] { "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5" })
            Assert.NotNull(Achar(lista, id));
        var opus = Achar(lista, "claude-opus-5-5")!.Value;
        Assert.Equal(4m, opus.GetProperty("precoEntradaMTok").GetDecimal());
        Assert.Equal(20m, opus.GetProperty("precoSaidaMTok").GetDecimal());
        Assert.True(opus.GetProperty("ativo").GetBoolean());
    }

    [Fact]
    public async Task Usuario_comum_nao_cria_nem_edita_modelo()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await usuario.PostAsJsonAsync(Rota, NovoModelo(NovoId()))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await usuario.PutAsJsonAsync($"{Rota}/claude-opus-5-5",
            new { nomeExibicao = "Hack", precoEntradaMTok = 0, precoSaidaMTok = 0 })).StatusCode);
    }

    [Fact]
    public async Task Admin_cria_edita_e_desativa_modelo()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var id = NovoId();

        var criado = await admin.PostAsJsonAsync(Rota, NovoModelo(id));
        Assert.Equal(HttpStatusCode.Created, criado.StatusCode);
        Assert.Equal(1.25m, (await criado.JsonAsync()).GetProperty("precoEntradaMTok").GetDecimal());

        var repetido = await admin.PostAsJsonAsync(Rota, NovoModelo(id));
        Assert.Equal(HttpStatusCode.Conflict, repetido.StatusCode);
        Assert.Equal("Modelos.JaExiste", await repetido.CodigoErroAsync());

        var editado = await admin.PutAsJsonAsync($"{Rota}/{id}",
            new { nomeExibicao = "Claude Editado", precoEntradaMTok = 2m, precoSaidaMTok = 9.9999m, ativo = false });
        Assert.Equal(HttpStatusCode.OK, editado.StatusCode);

        var modelo = Achar(await (await admin.GetAsync(Rota)).JsonAsync(), id)!.Value;
        Assert.Equal("Claude Editado", modelo.GetProperty("nomeExibicao").GetString());
        Assert.Equal(9.9999m, modelo.GetProperty("precoSaidaMTok").GetDecimal());
        Assert.False(modelo.TryGetProperty("precoCacheLeituraMTok", out _)); // limpo na edição
        Assert.False(modelo.GetProperty("ativo").GetBoolean());

        // Modelo desativado não pode virar padrão de ninguém
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var preferencia = await usuario.PutAsJsonAsync("/api/v1/configuracoes/preferencias", new { modeloPadraoId = id });
        Assert.Equal("Configuracoes.ModeloInvalido", await preferencia.CodigoErroAsync());
    }

    [Theory]
    [InlineData("Claude Opus", 1, 1)]   // id fora do formato da API
    [InlineData("claude-ok-id", -1, 1)] // preço negativo
    [InlineData("claude-ok-id", 1, 1.12345)] // mais de 4 casas
    public async Task Dados_invalidos_respondem_400(string id, decimal entrada, decimal saida)
    {
        var admin = await factory.ClienteNovoAdminAsync();

        var resposta = await admin.PostAsJsonAsync(Rota,
            new { modeloId = id, nomeExibicao = "X", precoEntradaMTok = entrada, precoSaidaMTok = saida });

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }

    [Fact]
    public async Task Editar_modelo_inexistente_responde_404()
    {
        var admin = await factory.ClienteNovoAdminAsync();

        var resposta = await admin.PutAsJsonAsync($"{Rota}/claude-nao-existe",
            new { nomeExibicao = "X", precoEntradaMTok = 1, precoSaidaMTok = 1 });

        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
        Assert.Equal("Modelos.NaoEncontrado", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Rodar_o_schema_de_novo_nao_desfaz_a_edicao_do_admin()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var editado = await admin.PutAsJsonAsync($"{Rota}/claude-haiku-5-5",
            new { nomeExibicao = "Claude Haiku 5.5", precoEntradaMTok = 0.2m, precoSaidaMTok = 1m, precoCacheLeituraMTok = 0.02m });
        Assert.Equal(HttpStatusCode.OK, editado.StatusCode);

        await factory.AplicarSchemaAsync(); // o deploy roda o schema.sql de novo

        var haiku = Achar(await (await admin.GetAsync(Rota)).JsonAsync(), "claude-haiku-5-5")!.Value;
        Assert.Equal(0.2m, haiku.GetProperty("precoEntradaMTok").GetDecimal());
        Assert.Equal(1, await factory.ConsultarAsync<long>(
            "SELECT COUNT(*) FROM migracoes_dados WHERE nome = '2026-10-30-modelos-claude-iniciais'"));
    }
}
