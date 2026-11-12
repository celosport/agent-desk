using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using AgentDesk.SharedKernel.Identidade;

namespace AgentDesk.Infrastructure.Auth;

/// <summary>
/// "Ver como": o token do ADMIN olhando como outro usuário só pode LER. Qualquer método que altera dado (POST, PUT, PATCH, DELETE)
/// é recusado aqui, antes de chegar ao controller. [[ADR-020 - Ver Como (Admin em Somente Leitura)]]
/// </summary>
public static class VerComoSomenteLeitura
{
    public const string Codigo = "Auth.SomenteLeitura";

    public static IApplicationBuilder UseVerComoSomenteLeitura(this IApplicationBuilder app) => app.Use(async (contexto, proximo) =>
    {
        var verComo = contexto.User.Identity?.IsAuthenticated == true && contexto.User.HasClaim(c => c.Type == ClaimsAgentDesk.VerComo);
        if (verComo && !HttpMethods.IsGet(contexto.Request.Method) && !HttpMethods.IsHead(contexto.Request.Method) && !HttpMethods.IsOptions(contexto.Request.Method))
        {
            contexto.Response.StatusCode = StatusCodes.Status403Forbidden;
            await contexto.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Somente leitura",
                Detail = "Você está vendo como outro usuário: nada pode ser alterado neste modo.",
                Extensions = { ["code"] = Codigo },
            }, (System.Text.Json.JsonSerializerOptions?)null, "application/problem+json");
            return;
        }
        await proximo();
    });
}
