using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Application.Modelos.AtualizarModelo;
using AgentDesk.Modules.Configuracoes.Application.Modelos.CriarModelo;
using AgentDesk.Modules.Configuracoes.Application.Modelos.ListarModelos;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Configuracoes.Endpoints;

/// <summary>Tabela de modelos e preços: todos leem, só o ADMIN cria e edita.</summary>
[ApiController]
[Route("api/v1/modelos")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class ModelosController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ModeloDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromServices] IQueryHandler<ListarModelosQuery, IReadOnlyList<ModeloDto>> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ListarModelosQuery(), ct));

    [HttpPost]
    [Authorize(Roles = Perfis.Admin)]
    [ProducesResponseType<ModeloDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Criar(
        [FromBody] CriarModeloRequestDto r, [FromServices] ICommandHandler<CriarModeloCommand, ModeloDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new CriarModeloCommand(r.ModeloId, r.NomeExibicao, r.PrecoEntradaMTok, r.PrecoSaidaMTok,
            r.PrecoCacheLeituraMTok, r.PrecoCacheEscritaMTok), ct);
        return result.IsSuccess ? Created($"/api/v1/modelos/{result.Value.ModeloId}", result.Value) : this.ToProblem(result.Error);
    }

    [HttpPut("{modeloId}")]
    [Authorize(Roles = Perfis.Admin)]
    [ProducesResponseType<ModeloDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Atualizar(
        string modeloId, [FromBody] AtualizarModeloRequestDto r,
        [FromServices] ICommandHandler<AtualizarModeloCommand, ModeloDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new AtualizarModeloCommand(modeloId, r.NomeExibicao, r.PrecoEntradaMTok, r.PrecoSaidaMTok,
            r.PrecoCacheLeituraMTok, r.PrecoCacheEscritaMTok, r.Ativo), ct));

    private IActionResult Responder<T>(Result<T> result) => result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
}
