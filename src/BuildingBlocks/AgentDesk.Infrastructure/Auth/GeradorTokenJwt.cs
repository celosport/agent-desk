using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Infrastructure.Auth;

internal sealed class GeradorTokenJwt(IOptions<JwtOptions> options, TimeProvider clock) : IGeradorToken
{
    private static readonly JsonWebTokenHandler Handler = new();

    public TokenAcesso Gerar(Guid usuarioId, string nome, string email, PerfilUsuario perfil)
        => Emitir(usuarioId, nome, email, perfil, options.Value.ExpiracaoMinutos, null);

    public TokenAcesso GerarVerComo(Guid usuarioId, string nome, string email, PerfilUsuario perfil, Guid adminId, int minutos)
        => Emitir(usuarioId, nome, email, perfil, minutos, adminId);

    private TokenAcesso Emitir(Guid usuarioId, string nome, string email, PerfilUsuario perfil, int minutos, Guid? verComoAdminId)
    {
        var jwt = options.Value;
        var agora = clock.GetUtcNow();
        var expiraEm = agora.AddMinutes(minutos);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            IssuedAt = agora.UtcDateTime,
            NotBefore = agora.UtcDateTime,
            Expires = expiraEm.UtcDateTime,
            Claims = new Dictionary<string, object>
            {
                [ClaimsAgentDesk.UsuarioId] = usuarioId.ToString(),
                [ClaimsAgentDesk.Nome] = nome,
                [ClaimsAgentDesk.Email] = email,
                [ClaimsAgentDesk.Perfil] = perfil.ToTexto(),
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString(),
            },
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.ChaveSecreta)), SecurityAlgorithms.HmacSha256),
        };

        if (verComoAdminId is { } admin) descriptor.Claims[ClaimsAgentDesk.VerComo] = admin.ToString();

        return new TokenAcesso(Handler.CreateToken(descriptor), expiraEm);
    }
}
