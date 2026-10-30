using AgentDesk.SharedKernel;

namespace AgentDesk.API;

/// <summary>
/// Prepara o banco ao subir a API nos ambientes da nuvem: aplica database/schema.sql
/// (idempotentes) e, se pedido, o seed de demonstração. Ambiente novo = banco vazio que se monta sozinho.
/// Ligado por configuração (Banco__AplicarScripts / Banco__AplicarSeed); desligado em dev e nos testes.
/// </summary>
internal static class InicializacaoBanco
{
    // Chave fixa do advisory lock: duas instâncias subindo juntas não rodam os scripts ao mesmo tempo
    private const long ChaveTrava = 7_202_610_077;

    private const int Tentativas = 5;

    /// <summary>
    /// Sobe os scripts em segundo plano: a API já responde /health enquanto o banco é preparado (o healthcheck da
    /// nuvem não derruba o deploy por causa de um script lento ou de uma trava no banco). Falha = erro curto e claro
    /// no log, com nova tentativa; nunca derruba o processo nem inunda o log.
    /// </summary>
    public static void AgendarAplicacao(WebApplication app)
    {
        if (!app.Configuration.GetValue("Banco:AplicarScripts", false)) return;

        var log = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("AgentDesk.InicializacaoBanco");
        app.Lifetime.ApplicationStarted.Register(() => _ = Task.Run(async () =>
        {
            for (var tentativa = 1; tentativa <= Tentativas; tentativa++)
            {
                try
                {
                    await AplicarAsync(app, app.Lifetime.ApplicationStopping);
                    return;
                }
                catch (OperationCanceledException) when (app.Lifetime.ApplicationStopping.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    var pg = ex as Npgsql.PostgresException;
                    log.LogError("Banco: falha ao aplicar os scripts (tentativa {Tentativa}/{Total}): {Tipo}: {Mensagem}{Detalhe}",
                        tentativa, Tentativas, ex.GetType().Name, ex.Message,
                        pg is null ? "" : $" [SqlState {pg.SqlState}; objeto {pg.TableName ?? pg.ConstraintName}; contexto {pg.Where}; posição {pg.Position}]");
                    if (tentativa < Tentativas)
                        await Task.Delay(TimeSpan.FromSeconds(10 * tentativa), app.Lifetime.ApplicationStopping);
                }
            }
        }));
    }

    public static async Task AplicarAsync(WebApplication app, CancellationToken cancellationToken = default)
    {
        if (!app.Configuration.GetValue("Banco:AplicarScripts", false)) return;

        var scripts = new List<string> { "schema.sql" };
        if (app.Configuration.GetValue("Banco:AplicarSeed", false)) scripts.Add("seed.sql"); // NUNCA em produção

        var pasta = Path.Combine(app.Environment.ContentRootPath, "database");
        var log = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("AgentDesk.InicializacaoBanco");
        var fabrica = app.Services.GetRequiredService<IDbConnectionFactory>();

        await using var conexao = await fabrica.OpenConnectionAsync(cancellationToken);
        // lock_timeout: se outra sessão segurar uma tabela, falha rápido com mensagem em vez de esperar 5 minutos calado
        await ExecutarAsync(conexao, $"SET lock_timeout = '60s'; SELECT pg_advisory_lock({ChaveTrava});", cancellationToken);
        try
        {
            foreach (var script in scripts)
            {
                var caminho = Path.Combine(pasta, script);
                if (!File.Exists(caminho))
                    throw new FileNotFoundException($"Script do banco não encontrado: {caminho}");

                await ExecutarAsync(conexao, await File.ReadAllTextAsync(caminho, cancellationToken), cancellationToken);
                log.LogInformation("Banco: {Script} aplicado.", script);
            }
        }
        finally
        {
            await ExecutarAsync(conexao, $"SELECT pg_advisory_unlock({ChaveTrava});", CancellationToken.None);
        }
    }

    private static async Task ExecutarAsync(System.Data.Common.DbConnection conexao, string sql, CancellationToken cancellationToken)
    {
        await using var comando = conexao.CreateCommand();
        comando.CommandText = sql;
        comando.CommandTimeout = 300;
        await comando.ExecuteNonQueryAsync(cancellationToken);
    }
}
