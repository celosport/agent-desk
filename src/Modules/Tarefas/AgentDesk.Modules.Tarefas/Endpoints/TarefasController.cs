using AgentDesk.Modules.Tarefas.Application.DTOs;
using AgentDesk.Modules.Tarefas.Application.Tarefas.ConcluirTarefa;
using AgentDesk.Modules.Tarefas.Application.Tarefas.CriarTarefa;
using AgentDesk.Modules.Tarefas.Application.Tarefas.ListarTarefas;
using AgentDesk.Modules.Tarefas.Domain;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Tarefas.Endpoints;

/// <summary>
/// Controller enxuto: traduz HTTP ↔ Command/Query e Result ↔ status. Sem SQL e sem regra de negócio.
/// O usuário vem do token (<see cref="IUsuarioAtual"/>), nunca do body.
/// </summary>
[ApiController]
[Route("api/v1/tarefas")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class TarefasController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<TarefaDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromQuery] StatusTarefa? status,
        [FromServices] IQueryHandler<ListarTarefasQuery, IReadOnlyList<TarefaDto>> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ListarTarefasQuery(usuarioAtual.UsuarioId, status), ct));

    [HttpPost]
    [ProducesResponseType<TarefaDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Criar(
        [FromBody] CriarTarefaRequestDto request,
        [FromServices] ICommandHandler<CriarTarefaCommand, TarefaDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new CriarTarefaCommand(usuarioAtual.UsuarioId, request.Titulo), ct);
        return result.IsSuccess ? Created($"/api/v1/tarefas/{result.Value.TarefaId}", result.Value) : this.ToProblem(result.Error);
    }

    [HttpPut("{tarefaId:guid}/concluir")]
    [ProducesResponseType<TarefaDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Concluir(
        Guid tarefaId, [FromServices] ICommandHandler<ConcluirTarefaCommand, TarefaDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ConcluirTarefaCommand(usuarioAtual.UsuarioId, tarefaId), ct));

    private IActionResult Responder<T>(Result<T> result) => result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
}
