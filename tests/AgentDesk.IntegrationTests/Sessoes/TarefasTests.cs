using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AgentDesk.IntegrationTests.Infraestrutura;

namespace AgentDesk.IntegrationTests.Sessoes;

/// <summary>Mandar tarefa pelo app para o Claude Code do PC: o app cria, o coletor busca e informa o resultado. [[ADR-018 - Mandar Tarefa para o Claude Code do PC]]</summary>
[Collection(ApiCollection.Nome)]
public sealed class TarefasTests(AgentDeskApiFactory factory)
{
    private const string Rota = "/api/v1/sessoes";
    private const string Chave = "aaaaaaaaaaaa";

    private sealed record Conta(HttpClient Http, Guid Id, string Token);

    private async Task<Conta> ContaAsync()
    {
        var http = await factory.ClienteNovoUsuarioAsync();
        var criado = await (await http.PostAsJsonAsync($"{Rota}/tokens", new { nome = "Notebook" })).JsonAsync();
        return new Conta(http, await AgentDeskApiFactory.IdAsync(http), criado.GetProperty("segredo").GetString()!);
    }

    private Task<HttpResponseMessage> ColetorAsync(HttpMethod metodo, string caminho, string? token, object? corpo = null)
    {
        var pedido = new HttpRequestMessage(metodo, $"{Rota}/controle/{caminho}");
        if (corpo is not null) pedido.Content = JsonContent.Create(corpo);
        if (token is not null) pedido.Headers.Add("X-AgentDesk-Token", token);
        return factory.CreateClient().SendAsync(pedido);
    }

    private Task<HttpResponseMessage> InformarPastasAsync(Conta c, string maquina = "Notebook", params (string Chave, string Nome)[] pastas)
        => ColetorAsync(HttpMethod.Put, "pastas", c.Token, new { maquina, pastas = pastas.Select(p => new { projetoChave = p.Chave, projeto = p.Nome }) });

    private async Task<List<JsonElement>> BuscarAsync(Conta c, string maquina = "Notebook")
        => (await (await ColetorAsync(HttpMethod.Get, $"tarefas?maquina={Uri.EscapeDataString(maquina)}", c.Token)).JsonAsync()).EnumerateArray().ToList();

    private static Task<HttpResponseMessage> EnviarAsync(Conta c, string texto = "Rode os testes", string maquina = "Notebook", string chave = Chave)
        => c.Http.PostAsJsonAsync($"{Rota}/tarefas", new { maquina, projetoChave = chave, texto });

    private static async Task<List<JsonElement>> TarefasAsync(Conta c) => (await (await c.Http.GetAsync($"{Rota}/tarefas")).JsonAsync()).EnumerateArray().ToList();

    private static async Task<string> StatusDeAsync(Conta c, string id)
        => (await TarefasAsync(c)).Single(t => t.GetProperty("tarefaId").GetString() == id).GetProperty("status").GetString()!;

    [Fact]
    public async Task Coletor_informa_as_pastas_liberadas_e_o_app_ve_o_computador_online()
    {
        var c = await ContaAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await InformarPastasAsync(c, "Notebook", (Chave, "loja"), ("bbbbbbbbbbbb", "api"))).StatusCode);

        var computadores = (await (await c.Http.GetAsync($"{Rota}/computadores")).JsonAsync()).EnumerateArray().ToList();
        var notebook = Assert.Single(computadores);
        Assert.Equal("Notebook", notebook.GetProperty("maquina").GetString());
        Assert.True(notebook.GetProperty("online").GetBoolean());
        Assert.Equal(["api", "loja"], notebook.GetProperty("pastas").EnumerateArray().Select(p => p.GetProperty("projeto").GetString()!).Order().ToArray());

        // A lista nova SUBSTITUI a anterior: pasta que o usuário tirou no PC deixa de aceitar tarefas
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        var depois = (await (await c.Http.GetAsync($"{Rota}/computadores")).JsonAsync()).EnumerateArray().Single();
        Assert.Equal(1, depois.GetProperty("pastas").GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await EnviarAsync(c, chave: "bbbbbbbbbbbb")).StatusCode);
    }

    [Fact]
    public async Task Computador_sem_sinal_ha_mais_de_45_segundos_aparece_offline()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        await factory.ExecutarAsync("UPDATE cc_pastas_liberadas SET visto_em = now() - INTERVAL '2 minutes' WHERE usuario_id = @U", new { U = c.Id });

        var notebook = (await (await c.Http.GetAsync($"{Rota}/computadores")).JsonAsync()).EnumerateArray().Single();
        Assert.False(notebook.GetProperty("online").GetBoolean());
    }

    [Fact]
    public async Task Pastas_e_tarefas_do_coletor_exigem_o_token_e_validam_o_corpo()
    {
        var c = await ContaAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await ColetorAsync(HttpMethod.Put, "pastas", null, new { maquina = "N", pastas = Array.Empty<object>() })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ColetorAsync(HttpMethod.Get, "tarefas?maquina=N", "adk_token-que-nao-existe-0000000000000000000000")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ColetorAsync(HttpMethod.Post, $"tarefas/{Guid.NewGuid()}/resultado", null, new { maquina = "N", status = "CONCLUIDA" })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await InformarPastasAsync(c, "Notebook", ("curta", "loja"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await InformarPastasAsync(c, " ")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ColetorAsync(HttpMethod.Post, $"tarefas/{Guid.NewGuid()}/resultado", c.Token, new { maquina = "N", status = "OUTRO" })).StatusCode);
    }

    [Fact]
    public async Task Tarefa_percorre_o_caminho_pendente_em_andamento_concluida_e_sai_uma_vez_so()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));

        var resposta = await EnviarAsync(c, "  Rode os testes e corrija  ");
        Assert.Equal(HttpStatusCode.Created, resposta.StatusCode);
        var criada = await resposta.JsonAsync();
        var id = criada.GetProperty("tarefaId").GetString()!;
        Assert.Equal("PENDENTE", criada.GetProperty("status").GetString());
        Assert.Equal("loja", criada.GetProperty("projeto").GetString());
        Assert.Equal("Rode os testes e corrija", criada.GetProperty("texto").GetString());

        var buscadas = await BuscarAsync(c);
        var entregue = Assert.Single(buscadas);
        Assert.Equal(id, entregue.GetProperty("tarefaId").GetString()); // o id é o --session-id do Claude Code
        Assert.Equal(Chave, entregue.GetProperty("projetoChave").GetString());
        Assert.Equal("Rode os testes e corrija", entregue.GetProperty("texto").GetString());
        Assert.Equal("EM_ANDAMENTO", await StatusDeAsync(c, id));
        Assert.Empty(await BuscarAsync(c)); // cada tarefa sai uma vez só

        var resultado = await ColetorAsync(HttpMethod.Post, $"tarefas/{id}/resultado", c.Token, new { maquina = "Notebook", status = "CONCLUIDA" });
        Assert.Equal(HttpStatusCode.NoContent, resultado.StatusCode);
        Assert.Equal("CONCLUIDA", await StatusDeAsync(c, id));

        var repetido = await ColetorAsync(HttpMethod.Post, $"tarefas/{id}/resultado", c.Token, new { maquina = "Notebook", status = "FALHOU" });
        Assert.Equal(HttpStatusCode.NotFound, repetido.StatusCode);
        Assert.Equal("CONCLUIDA", await StatusDeAsync(c, id)); // o resultado final não é sobrescrito
    }

    [Fact]
    public async Task Falha_guarda_o_motivo_curto()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        var id = (await (await EnviarAsync(c)).JsonAsync()).GetProperty("tarefaId").GetString()!;
        await BuscarAsync(c);

        await ColetorAsync(HttpMethod.Post, $"tarefas/{id}/resultado", c.Token, new { maquina = "Notebook", status = "FALHOU", erro = "O Claude Code saiu com o código 1." });

        var tarefa = (await TarefasAsync(c)).Single();
        Assert.Equal("FALHOU", tarefa.GetProperty("status").GetString());
        Assert.Equal("O Claude Code saiu com o código 1.", tarefa.GetProperty("erro").GetString());
    }

    [Fact]
    public async Task Tarefa_so_vai_para_o_computador_dela()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        await InformarPastasAsync(c, "Desktop", (Chave, "loja"));
        await EnviarAsync(c, maquina: "Desktop");

        Assert.Empty(await BuscarAsync(c, "Notebook"));
        Assert.Single(await BuscarAsync(c, "Desktop"));
    }

    [Fact]
    public async Task Pasta_nao_liberada_texto_vazio_e_texto_grande_demais_sao_recusados()
    {
        var c = await ContaAsync();
        var semPasta = await EnviarAsync(c);
        Assert.Equal(HttpStatusCode.NotFound, semPasta.StatusCode);
        Assert.Equal("Sessoes.PastaNaoLiberada", await semPasta.CodigoErroAsync());

        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        Assert.Equal(HttpStatusCode.BadRequest, (await EnviarAsync(c, "   ")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await EnviarAsync(c, new string('x', 4001))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await EnviarAsync(c, chave: "curta")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await EnviarAsync(c, new string('x', 4000))).StatusCode);
    }

    [Fact]
    public async Task No_maximo_5_tarefas_abertas_e_cancelar_uma_pendente_libera_uma_vaga()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        var ids = new List<string>();
        for (var i = 0; i < 5; i++) ids.Add((await (await EnviarAsync(c, $"tarefa {i}")).JsonAsync()).GetProperty("tarefaId").GetString()!);

        var excesso = await EnviarAsync(c, "a sexta");
        Assert.Equal(HttpStatusCode.Conflict, excesso.StatusCode);
        Assert.Equal("Sessoes.LimiteDeTarefas", await excesso.CodigoErroAsync());

        Assert.Equal(HttpStatusCode.NoContent, (await c.Http.PostAsync($"{Rota}/tarefas/{ids[0]}/cancelar", null)).StatusCode);
        Assert.Equal("CANCELADA", await StatusDeAsync(c, ids[0]));
        Assert.Equal(HttpStatusCode.Created, (await EnviarAsync(c, "agora cabe")).StatusCode);
    }

    [Fact]
    public async Task Tarefa_cancelada_nao_e_entregue_e_a_ja_iniciada_nao_cancela_pelo_app()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        var cancelada = (await (await EnviarAsync(c, "vou cancelar")).JsonAsync()).GetProperty("tarefaId").GetString()!;
        await c.Http.PostAsync($"{Rota}/tarefas/{cancelada}/cancelar", null);
        Assert.Empty(await BuscarAsync(c));

        var iniciada = (await (await EnviarAsync(c, "esta começa")).JsonAsync()).GetProperty("tarefaId").GetString()!;
        await BuscarAsync(c);
        var resposta = await c.Http.PostAsync($"{Rota}/tarefas/{iniciada}/cancelar", null);
        Assert.Equal(HttpStatusCode.Conflict, resposta.StatusCode);
        Assert.Equal("Sessoes.TarefaJaIniciada", await resposta.CodigoErroAsync());

        var inexistente = await c.Http.PostAsync($"{Rota}/tarefas/{Guid.NewGuid()}/cancelar", null);
        Assert.Equal(HttpStatusCode.NotFound, inexistente.StatusCode);
    }

    [Fact]
    public async Task Pendente_ha_mais_de_10_minutos_aparece_expirada_e_nao_e_mais_entregue()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        var id = (await (await EnviarAsync(c)).JsonAsync()).GetProperty("tarefaId").GetString()!;
        await factory.ExecutarAsync("UPDATE cc_tarefas SET criada_em = now() - INTERVAL '20 minutes' WHERE tarefa_id = @Id::uuid", new { Id = id });

        Assert.Equal("EXPIRADA", await StatusDeAsync(c, id));
        Assert.Empty(await BuscarAsync(c));
    }

    [Fact]
    public async Task Em_andamento_sem_resultado_ha_mais_de_6_horas_aparece_como_falha()
    {
        var c = await ContaAsync();
        await InformarPastasAsync(c, "Notebook", (Chave, "loja"));
        var id = (await (await EnviarAsync(c)).JsonAsync()).GetProperty("tarefaId").GetString()!;
        await BuscarAsync(c);
        await factory.ExecutarAsync("UPDATE cc_tarefas SET iniciada_em = now() - INTERVAL '7 hours' WHERE tarefa_id = @Id::uuid", new { Id = id });

        Assert.Equal("FALHOU", await StatusDeAsync(c, id));
    }

    [Fact]
    public async Task Cada_usuario_ve_so_o_que_e_dele()
    {
        var dono = await ContaAsync();
        var outro = await ContaAsync();
        await InformarPastasAsync(dono, "Notebook", (Chave, "loja"));
        var id = (await (await EnviarAsync(dono)).JsonAsync()).GetProperty("tarefaId").GetString()!;

        Assert.Empty(await TarefasAsync(outro));
        Assert.Empty((await (await outro.Http.GetAsync($"{Rota}/computadores")).JsonAsync()).EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await outro.Http.PostAsync($"{Rota}/tarefas/{id}/cancelar", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await EnviarAsync(outro)).StatusCode); // a pasta do outro não vale para mim
        Assert.Empty(await BuscarAsync(outro)); // o coletor do outro não recebe a tarefa
        Assert.Equal(HttpStatusCode.NotFound, (await ColetorAsync(HttpMethod.Post, $"tarefas/{id}/resultado", outro.Token, new { maquina = "Notebook", status = "CONCLUIDA" })).StatusCode);
        Assert.Equal("PENDENTE", await StatusDeAsync(dono, id));
    }

    [Fact]
    public async Task Rotas_do_app_exigem_login()
    {
        var anonimo = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync($"{Rota}/tarefas")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync($"{Rota}/computadores")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsJsonAsync($"{Rota}/tarefas", new { maquina = "N", projetoChave = Chave, texto = "x" })).StatusCode);
    }
}
