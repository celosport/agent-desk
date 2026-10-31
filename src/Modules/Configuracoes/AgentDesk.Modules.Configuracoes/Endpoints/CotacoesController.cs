using AgentDesk.Modules.Configuracoes.Application.Cotacoes;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Configuracoes.Endpoints;

/// <summary>Cotação das moedas (R$, € e £) para o app mostrar os valores além do dólar. [[ADR-014 - Moedas (Cotação PTAX do Banco Central)]]</summary>
[ApiController]
[Route("api/v1/cotacoes")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class CotacoesController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<CotacoesDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Obter([FromServices] IQueryHandler<ObterCotacoesQuery, CotacoesDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new ObterCotacoesQuery(), ct);
        return result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
    }
}
