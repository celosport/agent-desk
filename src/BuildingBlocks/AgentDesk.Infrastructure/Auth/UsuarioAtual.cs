using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Infrastructure.Auth;

/// <summary>Lê o usuário das claims do JWT validado pelo middleware de autenticação.</summary>
internal sealed class UsuarioAtual(IHttpContextAccessor accessor) : IUsuarioAtual
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool Autenticado => Principal?.Identity?.IsAuthenticated == true;

    public Guid UsuarioId =>
        Guid.TryParse(Principal?.FindFirst(ClaimsAgentDesk.UsuarioId)?.Value, out var id)
            ? id
            : throw new InvalidOperationException("Requisição sem usuário autenticado.");

    public PerfilUsuario Perfil =>
        Principal?.FindFirst(ClaimsAgentDesk.Perfil)?.Value is { } perfil
            ? EnumTexto.Parse<PerfilUsuario>(perfil)
            : throw new InvalidOperationException("Requisição sem usuário autenticado.");
}
