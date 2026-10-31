using System.IO.Compression;
using System.Text.Json;
using AgentDesk.Modules.Sessoes.Application.Ingestao;
using AgentDesk.Modules.Sessoes.Application.Painel;
using AgentDesk.Modules.Sessoes.Application.Sessoes;
using AgentDesk.Modules.Sessoes.Application.Tokens;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AgentDesk.Modules.Sessoes.Endpoints;

/// <summary>
/// Sessões do Claude Code. Tokens e "ao vivo" usam o JWT do app; a ingestão (eventos dos hooks e telemetria OTLP) vem do PC do
/// usuário e usa o token de ingestão no header <c>X-AgentDesk-Token</c>. [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
/// </summary>
[ApiController]
[Route("api/v1/sessoes")]
[Authorize(Roles = $"{Perfis.Usuario},{Perfis.Admin}")]
public sealed class SessoesController(IUsuarioAtual usuarioAtual) : ControllerBase
{
    public const string HeaderToken = "X-AgentDesk-Token";

    [HttpGet("tokens")]
    [ProducesResponseType<IReadOnlyList<TokenIngestaoDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Tokens(
        [FromServices] IQueryHandler<ListarTokensQuery, IReadOnlyList<TokenIngestaoDto>> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ListarTokensQuery(usuarioAtual.UsuarioId), ct));

    [HttpPost("tokens")]
    [ProducesResponseType<TokenCriadoDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CriarToken(
        [FromBody] CriarTokenRequestDto request, [FromServices] ICommandHandler<CriarTokenCommand, TokenCriadoDto> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new CriarTokenCommand(usuarioAtual.UsuarioId, request.Nome), ct);
        return result.IsSuccess ? StatusCode(StatusCodes.Status201Created, result.Value) : this.ToProblem(result.Error);
    }

    [HttpDelete("tokens/{tokenId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RevogarToken(
        Guid tokenId, [FromServices] ICommandHandler<RevogarTokenCommand, bool> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new RevogarTokenCommand(usuarioAtual.UsuarioId, tokenId), ct);
        return result.IsSuccess ? NoContent() : this.ToProblem(result.Error);
    }

    /// <summary>Salas (projetos) e robôs (sessões) para o Escritório — o app consulta a cada poucos segundos.</summary>
    [HttpGet("ao-vivo")]
    [ProducesResponseType<AoVivoDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> AoVivo([FromServices] IQueryHandler<ObterAoVivoQuery, AoVivoDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ObterAoVivoQuery(usuarioAtual.UsuarioId), ct));

    /// <summary>
    /// Painel de tokens do Claude Code (totais, gráfico por dia, rankings, cache e ferramentas). <c>?escopo=TODOS</c> soma todos os
    /// usuários e é só do ADMIN (403 <c>Sessoes.SemPermissao</c>).
    /// </summary>
    [HttpGet("painel")]
    [ProducesResponseType<PainelClaudeCodeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Painel(
        [FromQuery] EscopoSessoes? escopo, [FromQuery] int? dias,
        [FromServices] IQueryHandler<ObterPainelQuery, PainelClaudeCodeDto> handler, CancellationToken ct)
    {
        if (!Escopo(escopo, out var usuarioId, out var erro)) return this.ToProblem(erro);
        return Responder(await handler.Handle(new ObterPainelQuery(usuarioId, dias ?? ObterPainelHandler.DiasPadrao), ct));
    }

    /// <summary>MEU → o usuário do token; TODOS → null (todos), só para ADMIN.</summary>
    private bool Escopo(EscopoSessoes? escopo, out Guid? usuarioId, out Error erro)
    {
        erro = Error.None;
        usuarioId = usuarioAtual.UsuarioId;
        if (escopo != EscopoSessoes.Todos) return true;
        if (usuarioAtual.Perfil != PerfilUsuario.Admin)
        {
            erro = Error.Forbidden("Sessoes.SemPermissao", "Só o administrador vê as sessões de todos os usuários.");
            return false;
        }
        usuarioId = null;
        return true;
    }

    /// <summary>Um evento de hook (vem do coletor no PC). 202 = aceito (inclusive evento desconhecido, que é ignorado).</summary>
    [HttpPost("eventos")]
    [AllowAnonymous]
    [RequestSizeLimit(16 * 1024)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Evento(
        [FromHeader(Name = HeaderToken)] string? token, [FromBody] EventoHookRequestDto evento,
        [FromServices] ICommandHandler<IngerirEventoCommand, bool> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new IngerirEventoCommand(token, evento), ct);
        return result.IsSuccess ? Accepted() : this.ToProblem(result.Error);
    }

    /// <summary>
    /// Receptor OTLP/HTTP em JSON para os logs do Claude Code (OTEL_EXPORTER_OTLP_LOGS_ENDPOINT aponta para cá).
    /// Responde o ExportLogsServiceResponse vazio. Aceita gzip (OTEL_EXPORTER_OTLP_COMPRESSION=gzip).
    /// </summary>
    [HttpPost("otlp/v1/logs")]
    [AllowAnonymous]
    [RequestSizeLimit(4 * 1024 * 1024)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Telemetria(
        [FromHeader(Name = HeaderToken)] string? token, [FromServices] ICommandHandler<IngerirTelemetriaCommand, int> handler,
        CancellationToken ct)
    {
        JsonDocument documento;
        try
        {
            var corpo = Request.Headers.ContentEncoding.ToString().Contains("gzip", StringComparison.OrdinalIgnoreCase)
                ? new GZipStream(Request.Body, CompressionMode.Decompress)
                : Request.Body;
            await using (corpo)
                documento = await JsonDocument.ParseAsync(corpo, cancellationToken: ct);
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException)
        {
            return this.ToProblem(new ValidationError(new Dictionary<string, string[]> { ["corpo"] = ["Esperado OTLP em JSON (http/json)."] }));
        }

        using (documento)
        {
            var result = await handler.Handle(new IngerirTelemetriaCommand(token, documento.RootElement), ct);
            return result.IsSuccess ? Ok(new { }) : this.ToProblem(result.Error);
        }
    }

    private IActionResult Responder<T>(Result<T> result) => result.IsSuccess ? Ok(result.Value) : this.ToProblem(result.Error);
}
