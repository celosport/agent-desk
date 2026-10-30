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
    {
        var jwt = options.Value;
        var agora = clock.GetUtcNow();
        var expiraEm = agora.AddMinutes(jwt.ExpiracaoMinutos);

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

        return new TokenAcesso(Handler.CreateToken(descriptor), expiraEm);
    }
}
