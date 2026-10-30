using System.Net;
using System.Net.Http.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Contas;

[Collection(ApiCollection.Nome)]
public sealed class AuthTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/auth";

    [Fact]
    public async Task Cadastro_login_e_rota_protegida()
    {
        var client = factory.CreateClient();
        var email = $"{Guid.NewGuid():N}@teste.dev";

        var cadastro = await client.PostAsJsonAsync($"{Rota}/cadastro", new { nome = "Ana", email, senha = "Senha@2026" });
        Assert.Equal(HttpStatusCode.Created, cadastro.StatusCode);

        var login = await client.PostAsJsonAsync($"{Rota}/login", new { email = email.ToUpperInvariant(), senha = "Senha@2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.False(string.IsNullOrEmpty((await login.JsonAsync()).GetProperty("accessToken").GetString()));
    }

    [Fact]
    public async Task Email_repetido_responde_409_e_senha_errada_401()
    {
        var client = factory.CreateClient();
        var email = $"{Guid.NewGuid():N}@teste.dev";
        await client.PostAsJsonAsync($"{Rota}/cadastro", new { nome = "Ana", email, senha = "Senha@2026" });

        var repetido = await client.PostAsJsonAsync($"{Rota}/cadastro", new { nome = "Outra", email, senha = "Senha@2026" });
        Assert.Equal(HttpStatusCode.Conflict, repetido.StatusCode);
        Assert.Equal("Auth.EmailEmUso", await repetido.CodigoErroAsync());

        var errada = await client.PostAsJsonAsync($"{Rota}/login", new { email, senha = "errada-errada" });
        Assert.Equal(HttpStatusCode.Unauthorized, errada.StatusCode);
    }

    [Fact]
    public async Task Entrada_invalida_responde_400_com_os_campos()
    {
        var resposta = await factory.CreateClient().PostAsJsonAsync($"{Rota}/cadastro", new { nome = "", email = "x", senha = "123" });

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        var erros = (await resposta.JsonAsync()).GetProperty("errors");
        Assert.True(erros.TryGetProperty("email", out _));
        Assert.True(erros.TryGetProperty("senha", out _));
    }

    [Fact]
    public async Task Rota_sem_token_responde_401_e_o_health_e_publico()
    {
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/tarefas")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }
}
