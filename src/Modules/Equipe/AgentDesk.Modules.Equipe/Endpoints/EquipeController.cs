using AgentDesk.Modules.Equipe.Application.Agentes.ListarAgentes;
using AgentDesk.Modules.Equipe.Application.Agentes.RestaurarAgente;
using AgentDesk.Modules.Equipe.Application.Agentes.SalvarAgente;
using AgentDesk.Modules.Equipe.Application.DTOs;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Equipe.Endpoints;

/// <summary>Nome e aparência dos agentes do usuário do token.</summary>
[ApiController]
[Route("api/v1/equipe")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class EquipeController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<AgenteDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromServices] IQueryHandler<ListarAgentesQuery, IReadOnlyList<AgenteDto>> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new ListarAgentesQuery(usuarioAtual.UsuarioId), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }

    [HttpPut]
    [ProducesResponseType<AgenteDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Salvar(
        [FromBody] SalvarAgenteRequestDto r, [FromServices] ICommandHandler<SalvarAgenteCommand, AgenteDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new SalvarAgenteCommand(usuarioAtual.UsuarioId, r.Alvo, r.Chave, r.Ordem ?? 0, r.Nome, r.CorCabeca,
            r.CorCorpo, r.CorDetalhe, r.CorOlhos, r.Acessorio, r.Antena, r.Expressao), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }

    /// <summary>Volta o agente ao padrão do Escritório.</summary>
    [HttpDelete("{alvo}/{ordem:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Restaurar(
        string alvo, int ordem, [FromQuery] string chave, [FromServices] ICommandHandler<RestaurarAgenteCommand, bool> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new RestaurarAgenteCommand(usuarioAtual.UsuarioId, alvo, chave ?? string.Empty, ordem), ct);
        return result.IsSuccess ? NoContent() : this.ToProblem(result.Error);
    }
}
