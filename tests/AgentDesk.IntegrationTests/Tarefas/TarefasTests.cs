using System.Net;
using System.Net.Http.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Tarefas;

[Collection(ApiCollection.Nome)]
public sealed class TarefasTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/tarefas";

    [Fact]
    public async Task Cria_lista_e_conclui()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var criada = await usuario.PostAsJsonAsync(Rota, new { titulo = "  Escrever os testes  " });
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);
        var tarefa = await criada.JsonAsync();
        Assert.Equal("Escrever os testes", tarefa.GetProperty("titulo").GetString()); // aparou os espaços
        Assert.Equal("PENDENTE", tarefa.GetProperty("status").GetString());
        var id = tarefa.GetProperty("tarefaId").GetGuid();

        var concluida = await usuario.PutAsync($"{Rota}/{id}/concluir", null);
        Assert.Equal(HttpStatusCode.OK, concluida.StatusCode);
        Assert.Equal("CONCLUIDA", (await concluida.JsonAsync()).GetProperty("status").GetString());

        var repetida = await usuario.PutAsync($"{Rota}/{id}/concluir", null);
        Assert.Equal(HttpStatusCode.Conflict, repetida.StatusCode);
        Assert.Equal("Tarefas.JaConcluida", await repetida.CodigoErroAsync());

        var pendentes = await (await usuario.GetAsync($"{Rota}?status=PENDENTE")).JsonAsync();
        Assert.Equal(0, pendentes.GetArrayLength());
        Assert.Equal(1, (await (await usuario.GetAsync(Rota)).JsonAsync()).GetArrayLength());
    }

    [Fact]
    public async Task Titulo_vazio_responde_400()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resposta = await usuario.PostAsJsonAsync(Rota, new { titulo = " " });

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.True((await resposta.JsonAsync()).GetProperty("errors").TryGetProperty("titulo", out _));
    }

    [Fact]
    public async Task Cada_usuario_so_ve_e_mexe_nas_proprias_tarefas()
    {
        var dona = await factory.ClienteNovoUsuarioAsync();
        var outro = await factory.ClienteNovoUsuarioAsync();
        var id = (await (await dona.PostAsJsonAsync(Rota, new { titulo = "Minha" })).JsonAsync()).GetProperty("tarefaId").GetGuid();

        Assert.Equal(0, (await (await outro.GetAsync(Rota)).JsonAsync()).GetArrayLength());
        var tentativa = await outro.PutAsync($"{Rota}/{id}/concluir", null);
        Assert.Equal(HttpStatusCode.NotFound, tentativa.StatusCode); // não revela que existe
    }
}
