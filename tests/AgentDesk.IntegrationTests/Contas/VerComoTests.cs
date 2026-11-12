using System.Net;
using System.Net.Http.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Contas;

/// <summary>"Ver como": o ADMIN olha o app como um usuário, só leitura, com auditoria. [[ADR-020 - Ver Como (Admin em Somente Leitura)]]</summary>
[Collection(ApiCollection.Nome)]
public sealed class VerComoTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/auth/ver-como";

    private async Task<(HttpClient Admin, HttpClient Usuario, Guid UsuarioId, string Nome)> CenarioAsync()
    {
        var nome = $"Maria {Guid.NewGuid():N}";
        var usuario = await factory.ClienteNovoUsuarioAsync(nome);
        return (await factory.ClienteNovoAdminAsync(), usuario, await AgentDeskApiFactory.IdAsync(usuario), nome);
    }

    private async Task<HttpClient> EntrarComoAsync(HttpClient admin, Guid usuarioId)
    {
        var resposta = await admin.PostAsJsonAsync(Rota, new { usuarioId });
        resposta.EnsureSuccessStatusCode();
        return factory.ClienteComToken((await resposta.JsonAsync()).GetProperty("accessToken").GetString()!);
    }

    [Fact]
    public async Task Admin_entra_como_o_usuario_e_ve_os_dados_dele()
    {
        var (admin, _, id, nome) = await CenarioAsync();

        var resposta = await admin.PostAsJsonAsync(Rota, new { usuarioId = id });

        resposta.EnsureSuccessStatusCode();
        var sessao = await resposta.JsonAsync();
        Assert.Equal(nome, sessao.GetProperty("usuario").GetProperty("nome").GetString());
        Assert.Equal("USUARIO", sessao.GetProperty("usuario").GetProperty("perfil").GetString());
        Assert.Equal("Admin de Teste", sessao.GetProperty("verComoPor").GetString());
        var visto = factory.ClienteComToken(sessao.GetProperty("accessToken").GetString()!);
        Assert.Equal(id, await AgentDeskApiFactory.IdAsync(visto));
        Assert.Equal(nome, (await (await visto.GetAsync("/api/v1/conta/perfil")).JsonAsync()).GetProperty("nome").GetString());
    }

    [Fact]
    public async Task No_modo_ver_como_ler_funciona_mas_qualquer_alteracao_e_recusada()
    {
        var (admin, _, id, nome) = await CenarioAsync();
        var visto = await EntrarComoAsync(admin, id);

        Assert.Equal(HttpStatusCode.OK, (await visto.GetAsync("/api/v1/configuracoes")).StatusCode);

        var troca = await visto.PutAsJsonAsync("/api/v1/conta/perfil", new { nome = "Nome trocado pelo admin" });
        Assert.Equal(HttpStatusCode.Forbidden, troca.StatusCode);
        Assert.Equal("Auth.SomenteLeitura", await troca.CodigoErroAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await visto.PostAsJsonAsync("/api/v1/notificacoes/teste", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await visto.DeleteAsync("/api/v1/configuracoes/chave-api")).StatusCode);

        // O nome do usuário continua o mesmo
        Assert.Equal(nome, (await (await visto.GetAsync("/api/v1/conta/perfil")).JsonAsync()).GetProperty("nome").GetString());
    }

    [Fact]
    public async Task O_token_do_ver_como_nao_abre_rotas_de_admin_nem_outro_ver_como()
    {
        var (admin, _, id, _) = await CenarioAsync();
        var visto = await EntrarComoAsync(admin, id);

        Assert.Equal(HttpStatusCode.Forbidden, (await visto.GetAsync("/api/v1/notificacoes/admin/destinatarios")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await visto.PostAsJsonAsync(Rota, new { usuarioId = id })).StatusCode);
    }

    [Fact]
    public async Task Nao_vale_para_outro_admin_nem_para_conta_que_nao_existe()
    {
        var admin = await factory.ClienteNovoAdminAsync();
        var outroAdmin = await AgentDeskApiFactory.IdAsync(await factory.ClienteNovoAdminAsync());

        var recusa = await admin.PostAsJsonAsync(Rota, new { usuarioId = outroAdmin });
        Assert.Equal(HttpStatusCode.Forbidden, recusa.StatusCode);
        Assert.Equal("Conta.VerComoSoUsuario", await recusa.CodigoErroAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsJsonAsync(Rota, new { usuarioId = Guid.NewGuid() })).StatusCode);
    }

    [Fact]
    public async Task Usuario_comum_e_visitante_nao_usam_o_ver_como()
    {
        var (_, usuario, id, _) = await CenarioAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await usuario.PostAsJsonAsync(Rota, new { usuarioId = id })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().PostAsJsonAsync(Rota, new { usuarioId = id })).StatusCode);
    }

    [Fact]
    public async Task Cada_uso_fica_na_auditoria()
    {
        var (admin, _, id, _) = await CenarioAsync();
        var adminId = await AgentDeskApiFactory.IdAsync(admin);

        await EntrarComoAsync(admin, id);
        await EntrarComoAsync(admin, id);

        Assert.Equal(2, await factory.ConsultarAsync<int>(
            "SELECT COUNT(*) FROM auditoria_ver_como WHERE admin_id = @AdminId AND usuario_id = @UsuarioId", new { AdminId = adminId, UsuarioId = id }));
    }

    [Fact]
    public async Task Login_normal_nao_tem_o_aviso_de_ver_como()
    {
        var usuario = await factory.ClienteNovoUsuarioAsync();
        var perfil = await (await usuario.GetAsync("/api/v1/conta/perfil")).JsonAsync();

        Assert.False(perfil.TryGetProperty("verComoPor", out _));
    }
}
