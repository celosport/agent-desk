using AgentDesk.Modules.Consumo.Application.Consumo;
using AgentDesk.Modules.Consumo.Application.DTOs;
using AgentDesk.Modules.Consumo.Domain;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Consumo.Endpoints;

/// <summary>
/// Painel e histórico de consumo. Padrão: só as chamadas do usuário do token. <c>?escopo=TODOS</c> soma todos os usuários e
/// é só do ADMIN (403 <c>Consumo.SemPermissao</c> para os outros).
/// </summary>
[ApiController]
[Route("api/v1/consumo")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class ConsumoController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpGet("resumo")]
    [ProducesResponseType<ResumoConsumoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Resumo(
        [FromQuery] EscopoConsumo? escopo, [FromQuery] int? dias,
        [FromServices] IQueryHandler<ObterResumoQuery, ResumoConsumoDto> handler, CancellationToken ct)
    {
        if (!Escopo(escopo, out var usuarioId, out var erro)) return this.ToProblem(erro);
        return Responder(await handler.Handle(new ObterResumoQuery(usuarioId, dias ?? ObterResumoHandler.DiasPadrao), ct));
    }

    [HttpGet("chamadas")]
    [ProducesResponseType<PaginaChamadasDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Chamadas(
        [FromQuery] EscopoConsumo? escopo, [FromQuery] DateOnly? de, [FromQuery] DateOnly? ate, [FromQuery] Guid? automacaoId,
        [FromQuery] string? modeloId, [FromQuery] StatusChamada? status, [FromQuery] int? pagina, [FromQuery] int? tamanho,
        [FromServices] IQueryHandler<ListarChamadasQuery, PaginaChamadasDto> handler, CancellationToken ct)
    {
        if (!Escopo(escopo, out var usuarioId, out var erro)) return this.ToProblem(erro);
        return Responder(await handler.Handle(
            new ListarChamadasQuery(usuarioId, de, ate, automacaoId, modeloId, status, pagina ?? 1, tamanho ?? 0), ct));
    }

    /// <summary>Uma chamada com o resultado. O ADMIN abre a de qualquer usuário; os outros, só as próprias (senão 404).</summary>
    [HttpGet("chamadas/{chamadaId:guid}")]
    [ProducesResponseType<ChamadaDetalheDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Chamada(
        Guid chamadaId, [FromServices] IQueryHandler<ObterChamadaQuery, ChamadaDetalheDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(
            new ObterChamadaQuery(chamadaId, usuarioAtual.Perfil == PerfilUsuario.Admin ? null : usuarioAtual.UsuarioId), ct));

    [HttpGet("filtros")]
    [ProducesResponseType<FiltrosConsumoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Filtros(
        [FromQuery] EscopoConsumo? escopo, [FromServices] IQueryHandler<ObterFiltrosQuery, FiltrosConsumoDto> handler, CancellationToken ct)
    {
        if (!Escopo(escopo, out var usuarioId, out var erro)) return this.ToProblem(erro);
        return Responder(await handler.Handle(new ObterFiltrosQuery(usuarioId), ct));
    }

    /// <summary>MEU → o usuário do token; TODOS → null (todos), só para ADMIN.</summary>
    private bool Escopo(EscopoConsumo? escopo, out Guid? usuarioId, out Error erro)
    {
        erro = Error.None;
        usuarioId = usuarioAtual.UsuarioId;
        if (escopo != EscopoConsumo.Todos) return true;
        if (usuarioAtual.Perfil != PerfilUsuario.Admin)
        {
            erro = ConsumoErros.SemPermissao;
            return false;
        }
        usuarioId = null;
        return true;
    }

    private IActionResult Responder<T>(Result<T> result) => result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
}
