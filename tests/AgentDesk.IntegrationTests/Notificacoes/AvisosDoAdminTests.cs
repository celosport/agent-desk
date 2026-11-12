using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;
using AgentDesk.Modules.Notificacoes.Domain;

namespace AgentDesk.IntegrationTests.Notificacoes;

/// <summary>Aviso push do ADMIN (ex.: "instale o app") para os usuários escolhidos ou para todos. [[ADR-019 - Aviso do Admin por Push]]</summary>
[Collection(ApiCollection.Nome)]
public sealed class AvisosDoAdminTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/notificacoes";

    private sealed record Pessoa(HttpClient Http, string Nome, Guid Id, string Endpoint);

    /// <summary>Usuário com nome único; <paramref name="comAparelho"/> liga os alertas num aparelho (endereço devolvido em <c>Endpoint</c>).</summary>
    private async Task<Pessoa> PessoaAsync(HttpClient admin, bool comAparelho)
    {
        var nome = $"Pessoa {Guid.NewGuid():N}";
        var http = await factory.ClienteNovoUsuarioAsync(nome);
        var endpoint = PushFalso.NovoEndpoint();
        if (comAparelho)
            (await http.PostAsJsonAsync($"{Rota}/dispositivos", new
            {
                endpoint,
                p256dh = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                auth = "tBHItJI5svbpez7KI4CCXg",
                nome = "Celular",
            })).EnsureSuccessStatusCode();
        var lista = await (await admin.GetAsync($"{Rota}/admin/destinatarios")).JsonAsync();
        var linha = lista.EnumerateArray().Single(d => d.GetProperty("nome").GetString() == nome);
        return new Pessoa(http, nome, linha.GetProperty("usuarioId").GetGuid(), endpoint);
    }

    private static object Aviso(IEnumerable<Guid>? ids, string titulo = "Instale o Agent Desk", string mensagem = "Abra o link no celular e toque em Instalar app.", string? url = "/entrar")
        => new { usuarioIds = ids, titulo, mensagem, url };

    [Fact]
    public async Task Lista_os_usuarios_com_quantos_aparelhos_recebem_alertas()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var com = await PessoaAsync(admin, comAparelho: true);
        var sem = await PessoaAsync(admin, comAparelho: false);

        var lista = (await (await admin.GetAsync($"{Rota}/admin/destinatarios")).JsonAsync()).EnumerateArray().ToList();

        Assert.Equal(1, lista.Single(d => d.GetProperty("usuarioId").GetGuid() == com.Id).GetProperty("aparelhos").GetInt32());
        Assert.Equal(0, lista.Single(d => d.GetProperty("usuarioId").GetGuid() == sem.Id).GetProperty("aparelhos").GetInt32());
    }

    [Fact]
    public async Task Avisa_so_quem_foi_escolhido()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var escolhida = await PessoaAsync(admin, comAparelho: true);
        var deFora = await PessoaAsync(admin, comAparelho: true);

        var resposta = await admin.PostAsJsonAsync($"{Rota}/admin/aviso", Aviso([escolhida.Id]));

        resposta.EnsureSuccessStatusCode();
        var resumo = await resposta.JsonAsync();
        Assert.Equal(1, resumo.GetProperty("escolhidos").GetInt32());
        Assert.Equal(1, resumo.GetProperty("alcancados").GetInt32());
        var envio = Assert.Single(factory.Push.Enviados(escolhida.Endpoint));
        Assert.Equal("Instale o Agent Desk", envio.Titulo);
        Assert.Contains("\"url\":\"/entrar\"", envio.Json);
        Assert.Empty(factory.Push.Enviados(deFora.Endpoint));
    }

    [Fact]
    public async Task Sem_lista_avisa_todos_e_conta_quem_nao_tem_aparelho()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var com = await PessoaAsync(admin, comAparelho: true);
        var sem = await PessoaAsync(admin, comAparelho: false);

        var resumo = await (await admin.PostAsJsonAsync($"{Rota}/admin/aviso", Aviso(null))).JsonAsync();

        Assert.Single(factory.Push.Enviados(com.Endpoint));
        Assert.True(resumo.GetProperty("alcancados").GetInt32() >= 1);
        Assert.True(resumo.GetProperty("semAparelho").GetInt32() >= 1);
        Assert.NotNull(sem); // só existe para entrar na contagem de "sem aparelho"
    }

    [Fact]
    public async Task Aviso_ignora_as_preferencias_de_tipo_de_alerta()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var p = await PessoaAsync(admin, comAparelho: true);
        (await p.Http.PutAsJsonAsync($"{Rota}/preferencias", new { automacoes = false, sessoes = false, permissoes = false })).EnsureSuccessStatusCode();

        await admin.PostAsJsonAsync($"{Rota}/admin/aviso", Aviso([p.Id]));

        Assert.Single(factory.Push.Enviados(p.Endpoint));
    }

    [Fact]
    public async Task Um_aparelho_que_falha_nao_impede_os_outros_e_aparece_nas_falhas()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var quebrado = await PessoaAsync(admin, comAparelho: true);
        var bom = await PessoaAsync(admin, comAparelho: true);
        factory.Push.Responder(quebrado.Endpoint, ResultadoEnvio.Falhou);

        var resumo = await (await admin.PostAsJsonAsync($"{Rota}/admin/aviso", Aviso([quebrado.Id, bom.Id]))).JsonAsync();

        Assert.Equal(1, resumo.GetProperty("alcancados").GetInt32());
        Assert.Equal(1, resumo.GetProperty("falhas").GetInt32());
        Assert.Single(factory.Push.Enviados(bom.Endpoint));
    }

    [Fact]
    public async Task Usuario_comum_nao_lista_nem_envia()
    {
        var comum = await factory.ClienteNovoUsuarioAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await comum.GetAsync($"{Rota}/admin/destinatarios")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await comum.PostAsJsonAsync($"{Rota}/admin/aviso", Aviso(null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync($"{Rota}/admin/destinatarios")).StatusCode);
    }

    [Theory]
    [InlineData("", "texto", "/")] // sem título
    [InlineData("Título", "", "/")] // sem mensagem
    [InlineData("Título", "texto", "https://site-malicioso.com")] // só caminhos do app
    [InlineData("Título", "texto", "//site-malicioso.com")]
    public async Task Recusa_aviso_invalido(string titulo, string mensagem, string url)
    {
        var admin = await factory.ClienteNovoAdminAsync();

        var resposta = await admin.PostAsJsonAsync($"{Rota}/admin/aviso", Aviso(null, titulo, mensagem, url));

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }

    [Fact]
    public async Task Lista_vazia_de_pessoas_e_recusada()
    {
        var admin = await factory.ClienteNovoAdminAsync();

        var resposta = await admin.PostAsJsonAsync($"{Rota}/admin/aviso", Aviso(Array.Empty<Guid>()));

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }
}
