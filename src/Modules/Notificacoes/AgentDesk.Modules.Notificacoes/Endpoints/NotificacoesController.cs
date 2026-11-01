using AgentDesk.Modules.Notificacoes.Application;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Notificacoes.Endpoints;

public sealed record RegistrarDispositivoRequestDto(string? Endpoint, string? P256dh, string? Auth, string? Nome);

public sealed record RemoverDispositivoRequestDto(string? Endpoint);

public sealed record PreferenciasAlertaRequestDto(bool Automacoes, bool Sessoes, bool Permissoes);

/// <summary>Alertas push no celular do usuário do token. [[ADR-016 - Alertas no Celular (Push do App)]]</summary>
[ApiController]
[Route("api/v1/notificacoes")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class NotificacoesController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<NotificacoesDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Obter([FromServices] IQueryHandler<ObterNotificacoesQuery, NotificacoesDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new ObterNotificacoesQuery(usuarioAtual.UsuarioId), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }

    /// <summary>O aparelho aceitou receber alertas (o app manda a inscrição que o navegador criou).</summary>
    [HttpPost("dispositivos")]
    [ProducesResponseType<DispositivoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Registrar(
        [FromBody] RegistrarDispositivoRequestDto r, [FromServices] ICommandHandler<RegistrarDispositivoCommand, DispositivoDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new RegistrarDispositivoCommand(usuarioAtual.UsuarioId, r.Endpoint, r.P256dh, r.Auth, r.Nome), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }

    /// <summary>O aparelho deixou de receber alertas. O endereço vai no corpo porque é longo demais para a URL.</summary>
    [HttpPost("dispositivos/remover")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Remover(
        [FromBody] RemoverDispositivoRequestDto r, [FromServices] ICommandHandler<RemoverDispositivoCommand, bool> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new RemoverDispositivoCommand(usuarioAtual.UsuarioId, r.Endpoint), ct);
        return result.IsSuccess ? NoContent() : this.ToProblem(result.Error);
    }

    [HttpPut("preferencias")]
    [ProducesResponseType<PreferenciasAlertaDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> SalvarPreferencias(
        [FromBody] PreferenciasAlertaRequestDto r, [FromServices] ICommandHandler<SalvarPreferenciasCommand, PreferenciasAlertaDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new SalvarPreferenciasCommand(usuarioAtual.UsuarioId, r.Automacoes, r.Sessoes, r.Permissoes), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }

    /// <summary>Manda um alerta de teste para todos os aparelhos do usuário.</summary>
    [HttpPost("teste")]
    [ProducesResponseType<EnvioTesteDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Testar([FromServices] ICommandHandler<EnviarTesteCommand, EnvioTesteDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new EnviarTesteCommand(usuarioAtual.UsuarioId), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }
}
