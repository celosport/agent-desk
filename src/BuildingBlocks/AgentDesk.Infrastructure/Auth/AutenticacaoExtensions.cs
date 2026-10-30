using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using AgentDesk.SharedKernel.Identidade;

namespace AgentDesk.Infrastructure.Auth;

public static class AutenticacaoExtensions
{
    /// <summary>
    /// JWT Bearer (HS256) + autorização "segura por padrão": toda rota exige usuário autenticado,
    /// salvo as marcadas com [AllowAnonymous].
    /// </summary>
    public static IServiceCollection AddAutenticacaoJwt(this IServiceCollection services, IConfiguration configuration)
    {
        var secao = configuration.GetSection(JwtOptions.Secao);
        var jwt = secao.Get<JwtOptions>() ?? new JwtOptions();

        if (Encoding.UTF8.GetByteCount(jwt.ChaveSecreta) < JwtOptions.TamanhoMinimoChaveBytes)
            throw new InvalidOperationException(
                $"Jwt:ChaveSecreta ausente ou curta (mínimo {JwtOptions.TamanhoMinimoChaveBytes} bytes). " +
                "Configure via 'dotnet user-secrets' ou a variável de ambiente Jwt__ChaveSecreta.");

        services.Configure<JwtOptions>(secao);
        services.AddHttpContextAccessor();
        services.AddScoped<IUsuarioAtual, UsuarioAtual>();
        services.AddSingleton<IGeradorToken, GeradorTokenJwt>();

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.MapInboundClaims = false; // mantém "sub"/"role" como emitidos
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.ChaveSecreta)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = ClaimsAgentDesk.Nome,
                    RoleClaimType = ClaimsAgentDesk.Perfil,
                };
            });

        services.AddAuthorization(o =>
            o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        return services;
    }
}
