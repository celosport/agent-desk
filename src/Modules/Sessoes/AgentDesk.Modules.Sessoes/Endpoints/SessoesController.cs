using System.IO.Compression;
using System.Text.Json;
using AgentDesk.Modules.Sessoes.Application.Ingestao;
using AgentDesk.Modules.Sessoes.Application.Limites;
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

    /// <summary>Janelas de 5 horas e da semana da assinatura (a última leitura da statusline). Uma janela que já renovou não aparece.</summary>
    [HttpGet("limites")]
    [ProducesResponseType<LimitesDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Limites([FromServices] IQueryHandler<ObterLimitesQuery, LimitesDto> handler, CancellationToken ct)
        => Responder(await handler.Handle(new ObterLimitesQuery(usuarioAtual.UsuarioId), ct));

    /// <summary>A statusline do Claude Code (via coletor, no máximo 1 vez por minuto) informa quanto das janelas já foi usado.</summary>
    [HttpPost("limites")]
    [AllowAnonymous]
    [RequestSizeLimit(4 * 1024)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> InformarLimites(
        [FromHeader(Name = HeaderToken)] string? token, [FromBody] LimitesRequestDto corpo,
        [FromServices] ICommandHandler<InformarLimitesCommand, bool> handler, CancellationToken ct)
    {
        var result = await handler.Handle(new InformarLimitesCommand(token, corpo), ct);
        return result.IsSuccess ? Accepted() : this.ToProblem(result.Error);
    }

    /// <summary>Dicas para gastar menos tokens (5 regras sobre os últimos 7 dias), com a economia estimada.</summary>
    [HttpGet("dicas")]
    [ProducesResponseType<DicasDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Dicas(
        [FromQuery] EscopoSessoes? escopo, [FromServices] IQueryHandler<ObterDicasQuery, DicasDto> handler, CancellationToken ct)
    {
        if (!Escopo(escopo, out var usuarioId, out var erro)) return this.ToProblem(erro);
        return Responder(await handler.Handle(new ObterDicasQuery(usuarioId), ct));
    }

    /// <summary>Sessões dos últimos 90 dias (duração, pedidos, tokens, ≈ US$ e cache), com filtro por projeto e período.</summary>
    [HttpGet("historico")]
    [ProducesResponseType<PaginaHistoricoSessoesDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Historico(
        [FromQuery] EscopoSessoes? escopo, [FromQuery] string? projeto, [FromQuery] DateOnly? de, [FromQuery] DateOnly? ate,
        [FromQuery] int? pagina, [FromQuery] int? tamanho,
        [FromServices] IQueryHandler<ListarHistoricoSessoesQuery, PaginaHistoricoSessoesDto> handler, CancellationToken ct)
    {
        if (!Escopo(escopo, out var usuarioId, out var erro)) return this.ToProblem(erro);
        return Responder(await handler.Handle(new ListarHistoricoSessoesQuery(usuarioId, projeto, de, ate, pagina ?? 1, tamanho ?? 0), ct));
    }

    /// <summary>
    /// O que a sessão fez, hora a hora. O ADMIN abre a de qualquer usuário (<c>?escopo=TODOS</c>); os outros, só as próprias (senão 404).
    /// </summary>
    [HttpGet("historico/{sessaoId}")]
    [ProducesResponseType<LinhaDoTempoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> LinhaDoTempo(
        string sessaoId, [FromQuery] EscopoSessoes? escopo,
        [FromServices] IQueryHandler<ObterLinhaDoTempoQuery, LinhaDoTempoDto> handler, CancellationToken ct)
    {
        // Usuário comum nunca enxerga a sessão de outro: com escopo TODOS ele cai em 403 como nas outras rotas
        if (!Escopo(escopo, out var usuarioId, out var erro)) return this.ToProblem(erro);
        return Responder(await handler.Handle(new ObterLinhaDoTempoQuery(usuarioId, sessaoId), ct));
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
