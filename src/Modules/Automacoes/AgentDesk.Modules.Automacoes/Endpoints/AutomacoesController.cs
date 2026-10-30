using AgentDesk.Modules.Automacoes.Application.Automacoes.AtualizarAutomacao;
using AgentDesk.Modules.Automacoes.Application.Automacoes.ExecutarAutomacao;
using AgentDesk.Modules.Automacoes.Application.Automacoes.ListarAutomacoes;
using AgentDesk.Modules.Automacoes.Application.DTOs;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Automacoes.Endpoints;

/// <summary>Automações em 1 clique. A chamada à Claude é feita aqui no servidor, com a chave do usuário do token.</summary>
[ApiController]
[Route("api/v1/automacoes")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class AutomacoesController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<AutomacaoDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromServices] IQueryHandler<ListarAutomacoesQuery, IReadOnlyList<AutomacaoDto>> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ListarAutomacoesQuery(usuarioAtual.Perfil == PerfilUsuario.Admin), ct));

    [HttpPut("{automacaoId:guid}")]
    [Authorize(Roles = Perfis.Admin)]
    [ProducesResponseType<AutomacaoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Atualizar(
        Guid automacaoId, [FromBody] AtualizarAutomacaoRequestDto r,
        [FromServices] ICommandHandler<AtualizarAutomacaoCommand, AutomacaoDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new AtualizarAutomacaoCommand(
            automacaoId, r.Nome, r.Descricao, r.PromptSistema, r.ModeloMensagem, r.ModeloId, r.MaxTokens, r.Ativa), ct));

    /// <summary>Roda o fluxo. Erros: 400 (entrada), 404, 422 (chave, modelo, limite, recusa, Anthropic.ChaveInvalida…), 503 (Anthropic fora).</summary>
    [HttpPost("{automacaoId:guid}/executar")]
    [RequestSizeLimit(1024 * 1024)] // entrada até 200 KB de texto; folga para o JSON
    [ProducesResponseType<ExecucaoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Executar(
        Guid automacaoId, [FromBody] ExecutarAutomacaoRequestDto r,
        [FromServices] ICommandHandler<ExecutarAutomacaoCommand, ExecucaoDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(
            new ExecutarAutomacaoCommand(usuarioAtual.UsuarioId, automacaoId, r.Entrada, r.ModeloId, r.NomeArquivo), ct));

    private IActionResult Responder<T>(Result<T> result) => result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
}
