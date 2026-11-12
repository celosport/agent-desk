using System.Data.Common;
using Dapper;
using AgentDesk.Modules.Contas.Domain;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Modules.Contas.Infrastructure;

internal sealed class UsuariosRepository(IDbConnectionFactory connectionFactory) : IUsuariosRepository
{
    private const string UniqueViolation = "23505";
    private const string Colunas = "usuario_id, nome, email, senha_hash, tipo_perfil, foto_versao";

    private sealed class Linha
    {
        public Guid UsuarioId { get; set; }
        public string Nome { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? SenhaHash { get; set; }
        public string TipoPerfil { get; set; } = "USUARIO";
        public string? FotoVersao { get; set; }

        public Usuario ParaDominio() => new(UsuarioId, Nome, Email, SenhaHash, EnumTexto.Parse<PerfilUsuario>(TipoPerfil), FotoVersao);
    }

    private sealed class LinhaFoto
    {
        public byte[] Foto { get; set; } = [];
        public string FotoTipo { get; set; } = string.Empty;
    }

    public async Task<Usuario?> ObterPorEmailAsync(string email, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM usuarios WHERE lower(email) = lower(@Email);";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var l = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(sql, new { Email = email }, cancellationToken: cancellationToken));
        return l?.ParaDominio();
    }

    public async Task<Usuario?> ObterPorIdAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {Colunas} FROM usuarios WHERE usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var l = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return l?.ParaDominio();
    }

    public async Task<bool> InserirAsync(Usuario u, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO usuarios (usuario_id, nome, email, senha_hash, tipo_perfil)
            VALUES (@UsuarioId, @Nome, @Email, @SenhaHash, @Perfil);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        try
        {
            await connection.ExecuteAsync(new CommandDefinition(sql, new { u.UsuarioId, u.Nome, u.Email, u.SenhaHash, Perfil = u.Perfil.ToTexto() }, cancellationToken: cancellationToken));
            return true;
        }
        catch (DbException ex) when (ex.SqlState == UniqueViolation) // módulos não referenciam o Npgsql: DbException basta
        {
            return false; // e-mail repetido: o banco é a fonte da verdade (sem "consultar antes" que sofre corrida)
        }
    }

    public async Task AtualizarNomeAsync(Guid usuarioId, string nome, CancellationToken cancellationToken)
    {
        const string sql = "UPDATE usuarios SET nome = @Nome WHERE usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new { UsuarioId = usuarioId, Nome = nome }, cancellationToken: cancellationToken));
    }

    public async Task<Foto?> ObterFotoAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = "SELECT foto, foto_tipo FROM usuarios WHERE usuario_id = @UsuarioId AND foto IS NOT NULL;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var l = await connection.QuerySingleOrDefaultAsync<LinhaFoto>(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
        return l is null ? null : new Foto(l.Foto, l.FotoTipo);
    }

    public async Task SalvarFotoAsync(Guid usuarioId, Foto foto, string versao, CancellationToken cancellationToken)
    {
        const string sql = "UPDATE usuarios SET foto = @Bytes, foto_tipo = @Tipo, foto_versao = @Versao WHERE usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new { UsuarioId = usuarioId, foto.Bytes, foto.Tipo, Versao = versao }, cancellationToken: cancellationToken));
    }

    public async Task RemoverFotoAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        const string sql = "UPDATE usuarios SET foto = NULL, foto_tipo = NULL, foto_versao = NULL WHERE usuario_id = @UsuarioId;";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new { UsuarioId = usuarioId }, cancellationToken: cancellationToken));
    }
}
