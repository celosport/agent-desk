using AgentDesk.Modules.Contas.Application.Auth;
using AgentDesk.Modules.Contas.Application.Perfil;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Contas.Endpoints;

/// <summary>Perfil de quem está logado: dados, nome e foto. O usuário vem do token, nunca da rota (só a foto é lida por URL).</summary>
[ApiController]
public sealed class PerfilController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpGet("api/v1/conta/perfil")]
    [Authorize]
    [ProducesResponseType<UsuarioDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Obter([FromServices] IQueryHandler<ObterPerfilQuery, UsuarioDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ObterPerfilQuery(usuarioAtual.UsuarioId), ct));

    [HttpPut("api/v1/conta/perfil")]
    [Authorize]
    [ProducesResponseType<UsuarioDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> AtualizarNome(
        [FromBody] AtualizarNomeRequestDto request, [FromServices] ICommandHandler<AtualizarNomeCommand, UsuarioDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new AtualizarNomeCommand(usuarioAtual.UsuarioId, request.Nome), ct));

    /// <summary>Multipart, campo <c>arquivo</c>: a foto já recortada pelo app (PNG, JPEG ou WEBP, até 1 MB, conferida pelo conteúdo).</summary>
    [HttpPost("api/v1/conta/foto")]
    [Authorize]
    [RequestSizeLimit(2 * 1024 * 1024)]
    [ProducesResponseType<UsuarioDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> EnviarFoto(
        IFormFile? arquivo, [FromServices] ICommandHandler<EnviarFotoCommand, UsuarioDto> handler, CancellationToken ct)
    {
        if (arquivo is null || arquivo.Length == 0) return this.ToProblem(ContaFotoErro.Vazia);
        if (arquivo.Length > FormatoImagem.TamanhoMaximoBytes) return this.ToProblem(ContaFotoErro.Grande);

        await using var fluxo = arquivo.OpenReadStream();
        using var memoria = new MemoryStream((int)arquivo.Length);
        await fluxo.CopyToAsync(memoria, ct);
        return Responder(await handler.Handle(new EnviarFotoCommand(usuarioAtual.UsuarioId, memoria.ToArray()), ct));
    }

    [HttpDelete("api/v1/conta/foto")]
    [Authorize]
    [ProducesResponseType<UsuarioDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoverFoto([FromServices] ICommandHandler<RemoverFotoCommand, UsuarioDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new RemoverFotoCommand(usuarioAtual.UsuarioId), ct));

    /// <summary>Lida por &lt;img&gt; (que não manda token). O id é um GUID e o <c>v</c> muda a cada troca, então o cache longo é seguro.</summary>
    [HttpGet("api/v1/usuarios/{usuarioId:guid}/foto")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ObterFoto(
        Guid usuarioId, [FromServices] IQueryHandler<ObterFotoQuery, FotoDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new ObterFotoQuery(usuarioId), ct);
        if (!result.IsSuccess) return this.ToProblem(result.Error);

        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(result.Value.Bytes, result.Value.Tipo);
    }

    private IActionResult Responder<T>(Result<T> result) => result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
}

internal static class ContaFotoErro
{
    public static readonly Error Vazia = Error.Unprocessable("Conta.FotoInvalida", "Escolha uma imagem PNG, JPEG ou WEBP.");
    public static readonly Error Grande = Error.Unprocessable("Conta.FotoGrande", "A foto tem no máximo 1 MB.");
}
