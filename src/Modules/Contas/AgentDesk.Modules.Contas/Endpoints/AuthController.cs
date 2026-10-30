using AgentDesk.Modules.Contas.Application.Auth;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace AgentDesk.Modules.Contas.Endpoints;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpPost("cadastro")]
    [AllowAnonymous]
    [EnableRateLimiting(PoliticasRateLimit.Autenticacao)]
    [ProducesResponseType<SessaoDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Cadastro(
        [FromBody] CadastroRequestDto request, [FromServices] ICommandHandler<CadastrarCommand, SessaoDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new CadastrarCommand(request.Nome, request.Email, request.Senha), ct);
        return result.IsSuccess ? StatusCode(StatusCodes.Status201Created, result.Value) : this.ToProblem(result.Error);
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(PoliticasRateLimit.Autenticacao)]
    [ProducesResponseType<SessaoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequestDto request, [FromServices] ICommandHandler<LoginCommand, SessaoDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new LoginCommand(request.Email, request.Senha), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }

    /// <summary>Quem sou eu (exige token): útil para o front validar a sessão.</summary>
    [HttpGet("eu")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Eu() => Ok(new { usuarioId = usuarioAtual.UsuarioId, perfil = usuarioAtual.Perfil });
}
