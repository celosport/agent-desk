using Dapper;
using AgentDesk.Modules.Notificacoes.Domain;
using AgentDesk.SharedKernel;

namespace AgentDesk.Modules.Notificacoes.Infrastructure.Repositories;

/// <summary>Tabelas <c>notificacoes_dispositivos</c>, <c>notificacoes_preferencias</c> e <c>notificacoes_vapid</c>.</summary>
internal sealed class NotificacoesRepository(IDbConnectionFactory connectionFactory) : INotificacoesRepository
{
    private sealed class LinhaDispositivo
    {
        public Guid DispositivoId { get; set; }
        public Guid UsuarioId { get; set; }
        public string Endpoint { get; set; } = string.Empty;
        public string P256dh { get; set; } = string.Empty;
        public string Auth { get; set; } = string.Empty;
        public string Nome { get; set; } = string.Empty;
        public DateTimeOffset CriadoEm { get; set; }

        public Dispositivo ParaDominio() => new(DispositivoId, UsuarioId, Endpoint, P256dh, Auth, Nome, CriadoEm);
    }

    private const string ColunasDispositivo = "dispositivo_id, usuario_id, endpoint, p256dh, auth, nome, criado_em";

    public async Task<IReadOnlyList<Dispositivo>> ListarDispositivosAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {ColunasDispositivo} FROM notificacoes_dispositivos WHERE usuario_id = @UsuarioId ORDER BY criado_em;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linhas = await connection.QueryAsync<LinhaDispositivo>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linhas.Select(l => l.ParaDominio()).ToList();
    }

    public async Task<Dispositivo> SalvarDispositivoAsync(Dispositivo d, CancellationToken cancellationToken)
    {
        const string sql = $"""
            INSERT INTO notificacoes_dispositivos (dispositivo_id, usuario_id, endpoint, p256dh, auth, nome, criado_em)
            VALUES (@DispositivoId, @UsuarioId, @Endpoint, @P256dh, @Auth, @Nome, @CriadoEm)
            ON CONFLICT (endpoint) DO UPDATE
               SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, nome = EXCLUDED.nome
            RETURNING {ColunasDispositivo};
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleAsync<LinhaDispositivo>(new CommandDefinition(sql, new
        {
            d.DispositivoId, d.UsuarioId, d.Endpoint, d.P256dh, d.Auth, d.Nome, CriadoEm = d.CriadoEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
        return linha.ParaDominio();
    }

    public async Task<bool> RemoverDispositivoAsync(Guid usuarioId, string endpoint, CancellationToken cancellationToken)
    {
        const string sql = "DELETE FROM notificacoes_dispositivos WHERE usuario_id = @UsuarioId AND endpoint = @Endpoint;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteAsync(new CommandDefinition(sql, new { UsuarioId = usuarioId, Endpoint = endpoint }, cancellationToken: cancellationToken)) > 0;
    }

    public async Task RemoverDispositivoPorIdAsync(Guid dispositivoId, CancellationToken cancellationToken)
    {
        const string sql = "DELETE FROM notificacoes_dispositivos WHERE dispositivo_id = @DispositivoId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new { DispositivoId = dispositivoId }, cancellationToken: cancellationToken));
    }

    public async Task<PreferenciasAlerta> ObterPreferenciasAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = "SELECT automacoes, sessoes, permissoes FROM notificacoes_preferencias WHERE usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var linha = await connection.QuerySingleOrDefaultAsync<(bool Automacoes, bool Sessoes, bool Permissoes)?>(
            new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return linha is { } l ? new PreferenciasAlerta(l.Automacoes, l.Sessoes, l.Permissoes) : PreferenciasAlerta.Padrao;
    }

    public async Task SalvarPreferenciasAsync(Guid usuarioId, PreferenciasAlerta p, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO notificacoes_preferencias (usuario_id, automacoes, sessoes, permissoes)
            VALUES (@UsuarioId, @Automacoes, @Sessoes, @Permissoes)
            ON CONFLICT (usuario_id) DO UPDATE
               SET automacoes = EXCLUDED.automacoes, sessoes = EXCLUDED.sessoes, permissoes = EXCLUDED.permissoes;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new { UsuarioId = usuarioId, p.Automacoes, p.Sessoes, p.Permissoes },
            cancellationToken: cancellationToken));
    }

    public async Task<ChavesVapid> ObterOuCriarChavesAsync(Func<ChavesVapid> gerar, CancellationToken cancellationToken)
    {
        const string ler = "SELECT chave_publica AS Publica, chave_privada AS Privada FROM notificacoes_vapid WHERE id = 1;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var existente = await connection.QuerySingleOrDefaultAsync<(string Publica, string Privada)?>(new CommandDefinition(ler, cancellationToken: cancellationToken));
        if (existente is { } e) return new ChavesVapid(e.Publica, e.Privada);

        // Duas requisições na primeira vez: a segunda inserção não faz nada e as duas leem o par que ficou gravado
        var novas = gerar();
        const string gravar = """
            INSERT INTO notificacoes_vapid (id, chave_publica, chave_privada) VALUES (1, @Publica, @Privada)
            ON CONFLICT (id) DO NOTHING;
            """;
        await connection.ExecuteAsync(new CommandDefinition(gravar, new { novas.Publica, novas.Privada }, cancellationToken: cancellationToken));
        var gravada = await connection.QuerySingleAsync<(string Publica, string Privada)>(new CommandDefinition(ler, cancellationToken: cancellationToken));
        return new ChavesVapid(gravada.Publica, gravada.Privada);
    }
}
