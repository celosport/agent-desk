using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Contas;

[Collection(ApiCollection.Nome)]
public sealed class PerfilTests(AgentDeskApiFactory factory)
{
    private static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    private static MultipartFormDataContent Arquivo(byte[] bytes)
    {
        var corpo = new MultipartFormDataContent();
        corpo.Add(new ByteArrayContent(bytes), "arquivo", "foto.png");
        return corpo;
    }

    private static bool TemFoto(JsonElement perfil) => perfil.TryGetProperty("fotoUrl", out var f) && f.ValueKind != JsonValueKind.Null;

    [Fact]
    public async Task Perfil_mostra_quem_esta_logado_sem_foto()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync("Marcia Lima");

        var perfil = await (await usuario.GetAsync("/api/v1/conta/perfil")).JsonAsync();

        Assert.Equal("Marcia Lima", perfil.GetProperty("nome").GetString());
        Assert.Equal("USUARIO", perfil.GetProperty("perfil").GetString());
        Assert.False(TemFoto(perfil));
    }

    [Fact]
    public async Task Altera_o_nome_e_valida()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await usuario.PutAsJsonAsync("/api/v1/conta/perfil", new { nome = " " })).StatusCode);

        var ok = await usuario.PutAsJsonAsync("/api/v1/conta/perfil", new { nome = "  Nome Novo  " });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal("Nome Novo", (await ok.JsonAsync()).GetProperty("nome").GetString());
    }

    [Fact]
    public async Task Foto_sobe_aparece_no_perfil_e_e_servida_com_cache_longo()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var envio = await usuario.PostAsync("/api/v1/conta/foto", Arquivo(Png));

        Assert.Equal(HttpStatusCode.OK, envio.StatusCode);
        var url = (await envio.JsonAsync()).GetProperty("fotoUrl").GetString()!;
        Assert.StartsWith("/api/v1/usuarios/", url);
        var imagem = await factory.CreateClient().GetAsync(url); // <img> não manda token
        Assert.Equal(HttpStatusCode.OK, imagem.StatusCode);
        Assert.Equal("image/png", imagem.Content.Headers.ContentType?.MediaType);
        Assert.Contains("immutable", imagem.Headers.CacheControl?.ToString());
        Assert.Equal(Png, await imagem.Content.ReadAsByteArrayAsync());

        // O perfil seguinte já devolve a foto (o app abre com ela)
        Assert.Equal(url, (await (await usuario.GetAsync("/api/v1/conta/perfil")).JsonAsync()).GetProperty("fotoUrl").GetString());
    }

    [Fact]
    public async Task Foto_que_nao_e_imagem_422_e_remover_apaga()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();

        var texto = await usuario.PostAsync("/api/v1/conta/foto", Arquivo("<svg onload=alert(1)>"u8.ToArray()));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, texto.StatusCode);
        Assert.Equal("Conta.FotoInvalida", await texto.CodigoErroAsync());

        var url = (await (await usuario.PostAsync("/api/v1/conta/foto", Arquivo(Png))).JsonAsync()).GetProperty("fotoUrl").GetString()!;
        var remocao = await usuario.DeleteAsync("/api/v1/conta/foto");
        Assert.Equal(HttpStatusCode.OK, remocao.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await factory.CreateClient().GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Foto_acima_de_1_MB_e_recusada()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var grande = new byte[1024 * 1024 + 1];
        Png.CopyTo(grande, 0); // começa como PNG válido: o limite de tamanho é que recusa

        var resposta = await usuario.PostAsync("/api/v1/conta/foto", Arquivo(grande));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resposta.StatusCode);
        Assert.Equal("Conta.FotoGrande", await resposta.CodigoErroAsync());
    }

    [Fact]
    public async Task Perfil_exige_login_e_cada_um_mexe_so_na_propria_foto()
    {
        var anonimo = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync("/api/v1/conta/perfil")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsync("/api/v1/conta/foto", Arquivo(Png))).StatusCode);

        // O id vem do token: a foto de A não aparece no perfil de B
        var a = await factory.ClienteNovoUsuarioAsync();
        var b = await factory.ClienteNovoUsuarioAsync();
        await a.PostAsync("/api/v1/conta/foto", Arquivo(Png));
        Assert.False(TemFoto(await (await b.GetAsync("/api/v1/conta/perfil")).JsonAsync()));
    }
}
