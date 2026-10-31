using System.Net;
using System.Net.Http.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Equipe;

[Collection(ApiCollection.Nome)]
public sealed class EquipeTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/equipe";

    private static object Agente(string alvo = "PROJETO", string chave = "meu-projeto", int ordem = 0, string nome = "Beto") => new
    {
        alvo, chave, ordem, nome, corCabeca = "#AABBCC", corCorpo = "#112233", corDetalhe = "#ff8800", corOlhos = "#00ff00",
        acessorio = "COROA", antena = "DUPLA", expressao = "FELIZ",
    };

    [Fact]
    public async Task Sem_login_nao_acessa()
        => Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(Rota)).StatusCode);

    [Fact]
    public async Task Usuario_novo_nao_tem_agentes_personalizados()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var lista = await (await usuario.GetAsync(Rota)).JsonAsync();

        Assert.Equal(0, lista.GetArrayLength());
    }

    [Fact]
    public async Task Salva_lista_e_atualiza_o_mesmo_agente()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var salvo = await usuario.PutAsJsonAsync(Rota, Agente());
        Assert.Equal(HttpStatusCode.OK, salvo.StatusCode);
        var dto = await salvo.JsonAsync();
        Assert.Equal("Beto", dto.GetProperty("nome").GetString());
        Assert.Equal("#aabbcc", dto.GetProperty("corCabeca").GetString());   // cores saem em minúsculas
        Assert.Equal("COROA", dto.GetProperty("acessorio").GetString());

        // Salvar de novo o mesmo agente (alvo + chave + ordem) atualiza, não duplica
        var outro = await usuario.PutAsJsonAsync(Rota, Agente(nome: "Bia"));
        Assert.Equal(HttpStatusCode.OK, outro.StatusCode);

        var lista = await (await usuario.GetAsync(Rota)).JsonAsync();
        Assert.Equal(1, lista.GetArrayLength());
        Assert.Equal("Bia", lista[0].GetProperty("nome").GetString());

        // Outra posição na mesma equipe é outro agente
        Assert.Equal(HttpStatusCode.OK, (await usuario.PutAsJsonAsync(Rota, Agente(ordem: 1, nome: "Caco"))).StatusCode);
        Assert.Equal(2, (await (await usuario.GetAsync(Rota)).JsonAsync()).GetArrayLength());
    }

    [Fact]
    public async Task Acessorio_antena_e_expressao_sao_opcionais()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resposta = await usuario.PutAsJsonAsync(Rota, new
        {
            alvo = "AUTOMACAO", chave = "resumo", ordem = 0, nome = "Rô",
            corCabeca = "#111111", corCorpo = "#222222", corDetalhe = "#333333", corOlhos = "#444444",
        });

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        var dto = await resposta.JsonAsync();
        Assert.Equal("NENHUM", dto.GetProperty("acessorio").GetString());
        Assert.Equal("RETA", dto.GetProperty("antena").GetString());
        Assert.Equal("NORMAL", dto.GetProperty("expressao").GetString());
    }

    [Theory]
    [InlineData("alvo", "OUTRO")]
    [InlineData("chave", "")]
    [InlineData("ordem", 8)]
    [InlineData("nome", "")]
    [InlineData("nome", "um nome grande demais para caber")]
    [InlineData("corCorpo", "vermelho")]
    [InlineData("corOlhos", "#12345")]
    [InlineData("acessorio", "FOGUETE")]
    [InlineData("antena", "TRIPLA")]
    [InlineData("expressao", "RAIVA")]
    public async Task Rejeita_valor_invalido(string campo, object valor)
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var corpo = new Dictionary<string, object?>
        {
            ["alvo"] = "PROJETO", ["chave"] = "p", ["ordem"] = 0, ["nome"] = "Beto", ["corCabeca"] = "#111111", ["corCorpo"] = "#222222",
            ["corDetalhe"] = "#333333", ["corOlhos"] = "#444444", ["acessorio"] = "NENHUM", ["antena"] = "RETA", ["expressao"] = "NORMAL",
        };
        corpo[campo] = valor;

        var resposta = await usuario.PutAsJsonAsync(Rota, corpo);

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.Equal("Validacao.Falhou", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Agente_de_automacao_nao_tem_posicao_na_equipe()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var resposta = await usuario.PutAsJsonAsync(Rota, Agente(alvo: "AUTOMACAO", chave: "resumo", ordem: 2));

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }

    [Fact]
    public async Task Cada_usuario_ve_so_os_proprios_agentes()
    {
        var ana = await factory.ClienteNovoUsuarioAsync();
        var bia = await factory.ClienteNovoUsuarioAsync();
        (await ana.PutAsJsonAsync(Rota, Agente(nome: "DaAna"))).EnsureSuccessStatusCode();

        Assert.Equal(0, (await (await bia.GetAsync(Rota)).JsonAsync()).GetArrayLength());

        // Mesma chave, outro dono: não há agente para restaurar (404) e o da Ana continua lá
        Assert.Equal(HttpStatusCode.NotFound, (await bia.DeleteAsync($"{Rota}/PROJETO/0?chave=meu-projeto")).StatusCode);
        Assert.Equal(1, (await (await ana.GetAsync(Rota)).JsonAsync()).GetArrayLength());
    }

    [Fact]
    public async Task Restaurar_remove_a_personalizacao()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        (await usuario.PutAsJsonAsync(Rota, Agente())).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await usuario.DeleteAsync($"{Rota}/PROJETO/0?chave=meu-projeto")).StatusCode);
        Assert.Equal(0, (await (await usuario.GetAsync(Rota)).JsonAsync()).GetArrayLength());

        var repetido = await usuario.DeleteAsync($"{Rota}/PROJETO/0?chave=meu-projeto");
        Assert.Equal(HttpStatusCode.NotFound, repetido.StatusCode);
        Assert.Equal("Equipe.AgenteNaoEncontrado", await repetido.CodigoErroAsync());
    }

    [Fact]
    public async Task Apagar_o_usuario_apaga_a_equipe()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var id = await AgentDeskApiFactory.IdAsync(usuario);
        (await usuario.PutAsJsonAsync(Rota, Agente())).EnsureSuccessStatusCode();

        await factory.ExecutarAsync("DELETE FROM usuarios WHERE usuario_id = @Id", new { Id = id });

        Assert.Equal(0, await factory.ConsultarAsync<int>("SELECT COUNT(*) FROM agentes_personalizados WHERE usuario_id = @Id", new { Id = id }));
    }
}
