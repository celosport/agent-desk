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

    private sealed class Linha
    {
        public Guid UsuarioId { get; set; }
        public string Nome { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? SenhaHash { get; set; }
        public string TipoPerfil { get; set; } = "USUARIO";
    }

    public async Task<Usuario?> ObterPorEmailAsync(string email, CancellationToken cancellationToken)
    {
        const string sql = "SELECT usuario_id, nome, email, senha_hash, tipo_perfil FROM usuarios WHERE lower(email) = lower(@Email);";
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var l = await connection.QuerySingleOrDefaultAsync<Linha>(new CommandDefinition(sql, new { Email = email }, cancellationToken: cancellationToken));
        return l is null ? null : new Usuario(l.UsuarioId, l.Nome, l.Email, l.SenhaHash, EnumTexto.Parse<PerfilUsuario>(l.TipoPerfil));
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
}
