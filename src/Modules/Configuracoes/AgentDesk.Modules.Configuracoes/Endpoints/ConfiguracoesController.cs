using AgentDesk.Modules.Configuracoes.Application.Configuracoes.ObterConfiguracao;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.RemoverChaveApi;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.SalvarChaveApi;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.SalvarPreferencias;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.TestarChaveApi;
using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Configuracoes.Endpoints;

/// <summary>Configurações do usuário do token. A API key entra por aqui e nunca sai (só a versão mascarada).</summary>
[ApiController]
[Route("api/v1/configuracoes")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class ConfiguracoesController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<ConfiguracaoDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Obter(
        [FromServices] IQueryHandler<ObterConfiguracaoQuery, ConfiguracaoDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ObterConfiguracaoQuery(usuarioAtual.UsuarioId), ct));

    [HttpPut("chave-api")]
    [ProducesResponseType<ConfiguracaoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SalvarChave(
        [FromBody] SalvarChaveApiRequestDto request,
        [FromServices] ICommandHandler<SalvarChaveApiCommand, ConfiguracaoDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new SalvarChaveApiCommand(usuarioAtual.UsuarioId, request.ChaveApi), ct));

    [HttpDelete("chave-api")]
    [ProducesResponseType<ConfiguracaoDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoverChave(
        [FromServices] ICommandHandler<RemoverChaveApiCommand, ConfiguracaoDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new RemoverChaveApiCommand(usuarioAtual.UsuarioId), ct));

    [HttpPost("chave-api/testar")]
    [ProducesResponseType<TesteChaveDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> TestarChave(
        [FromServices] ICommandHandler<TestarChaveApiCommand, TesteChaveDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new TestarChaveApiCommand(usuarioAtual.UsuarioId), ct));

    [HttpPut("preferencias")]
    [ProducesResponseType<ConfiguracaoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> SalvarPreferencias(
        [FromBody] SalvarPreferenciasRequestDto request,
        [FromServices] ICommandHandler<SalvarPreferenciasCommand, ConfiguracaoDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new SalvarPreferenciasCommand(
            usuarioAtual.UsuarioId, request.ModeloPadraoId, request.LimiteMensalUsd, request.BloquearAoAtingirLimite), ct));

    private IActionResult Responder<T>(Result<T> result) => result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
}
