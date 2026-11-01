using System.Globalization;
using System.Text.Json;
using FluentValidation;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Tempo;

namespace AgentDesk.Modules.Sessoes.Application.Ingestao;

// Entrada dos dados do PC do usuário: autenticada pelo token de ingestão (header X-AgentDesk-Token), não pelo JWT.
// [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]

/// <summary>Evento de hook já filtrado pelo coletor (agentdesk-coletor.mjs). Nada de conteúdo de arquivo ou texto de prompt.</summary>
public sealed record EventoHookRequestDto(
    string? SessaoId,
    string? Evento,
    string? Maquina,
    string? Projeto,
    string? ProjetoChave,
    string? Ferramenta,
    string? Resumo,
    string? Notificacao,
    string? Modelo,
    DateTimeOffset? OcorridoEm);

public sealed record IngerirEventoCommand(string? Token, EventoHookRequestDto Evento) : ICommand<bool>;

internal sealed class IngerirEventoValidator : AbstractValidator<IngerirEventoCommand>
{
    public IngerirEventoValidator()
    {
        RuleFor(x => x.Evento.SessaoId).NotEmpty().MaximumLength(100).OverridePropertyName("sessaoId");
        RuleFor(x => x.Evento.Evento).NotEmpty().MaximumLength(40).OverridePropertyName("evento");
        RuleFor(x => x.Evento.Projeto).NotEmpty().MaximumLength(120).OverridePropertyName("projeto");
        RuleFor(x => x.Evento.ProjetoChave).NotEmpty().Length(12).OverridePropertyName("projetoChave");
        RuleFor(x => x.Evento.Maquina).MaximumLength(80).OverridePropertyName("maquina");
        RuleFor(x => x.Evento.Ferramenta).MaximumLength(80).OverridePropertyName("ferramenta");
        RuleFor(x => x.Evento.Resumo).MaximumLength(120).OverridePropertyName("resumo");
        RuleFor(x => x.Evento.Notificacao).MaximumLength(40).OverridePropertyName("notificacao");
        RuleFor(x => x.Evento.Modelo).MaximumLength(80).OverridePropertyName("modelo");
    }
}

/// <summary>Valida o token, traduz o evento em status/atividade e grava. Evento desconhecido = aceito e ignorado (coletor mais novo).</summary>
internal sealed class IngerirEventoHandler(ITokensRepository tokens, ISessoesRepository sessoes, INotificador notificador, TimeProvider clock)
    : ICommandHandler<IngerirEventoCommand, bool>
{
    public async Task<Result<bool>> Handle(IngerirEventoCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;

        var r = command.Evento;
        if (!Transicoes.Conhecidos.Contains(r.Evento!)) return false;

        var evento = new EventoHook(r.SessaoId!.Trim(), r.Evento!, Vazio(r.Maquina) ?? "?", r.Projeto!.Trim(), r.ProjetoChave!,
            Vazio(r.Ferramenta), Vazio(r.Resumo), Vazio(r.Notificacao), Vazio(r.Modelo), Autenticacao.Horario(r.OcorridoEm, agora));
        await sessoes.AplicarEventoAsync(usuarioId.Value, evento, Transicoes.De(evento), cancellationToken);
        await AvisarNoCelularAsync(usuarioId.Value, evento);
        return true;
    }

    /// <summary>
    /// Alerta no celular: a sessão terminou o que estava fazendo (Stop) ou está esperando o usuário (permissão ou pergunta).
    /// O Stop também chega quando o Claude Code só respondeu uma pergunta; para o usuário é igual: "terminou, volte aqui".
    /// </summary>
    private Task AvisarNoCelularAsync(Guid usuarioId, EventoHook e)
    {
        if (e.Evento == "Stop")
            return notificador.NotificarAsync(usuarioId, TipoAlerta.Sessao, $"✅ {e.Projeto} terminou", "O Claude Code acabou o que estava fazendo.", $"sessao-{e.SessaoId}", CancellationToken.None);
        if (e is { Evento: "Notification", Notificacao: "permission_prompt" or "elicitation_dialog" })
            return notificador.NotificarAsync(usuarioId, TipoAlerta.Permissao, $"✋ {e.Projeto} precisa de você",
                Transicoes.De(e).Atividade?.Replace("✋ Precisa de você: ", "") ?? "Está esperando a sua resposta.", $"permissao-{e.SessaoId}", CancellationToken.None);
        return Task.CompletedTask;
    }

    private static string? Vazio(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

/// <summary>Corpo de <c>POST /v1/logs</c> do OTLP em JSON (o exportador do Claude Code com OTEL_EXPORTER_OTLP_PROTOCOL=http/json).</summary>
public sealed record IngerirTelemetriaCommand(string? Token, JsonElement Corpo) : ICommand<int>;

internal sealed class IngerirTelemetriaHandler(ITokensRepository tokens, ISessoesRepository sessoes, TimeProvider clock)
    : ICommandHandler<IngerirTelemetriaCommand, int>
{
    public async Task<Result<int>> Handle(IngerirTelemetriaCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;

        var usos = OtlpLogs.ExtrairUsos(command.Corpo, agora);
        foreach (var uso in usos)
            await sessoes.RegistrarUsoAsync(usuarioId.Value, uso, FusoBrasil.DataLocal(uso.OcorridoEm), cancellationToken);
        return usos.Count;
    }
}

internal static class Autenticacao
{
    public static async Task<Guid?> UsuarioDoTokenAsync(ITokensRepository tokens, string? token, DateTimeOffset agora, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || !token.StartsWith(TokenIngestao.Inicio, StringComparison.Ordinal) || token.Length > 100)
            return null;
        return await tokens.ValidarAsync(TokenIngestao.Hash(token.Trim()), agora, ct);
    }

    /// <summary>Horário do PC, se for plausível; relógio muito adiantado ou atrasado vira "agora" do servidor.</summary>
    public static DateTimeOffset Horario(DateTimeOffset? informado, DateTimeOffset agora)
        => informado is { } h && h <= agora.AddMinutes(5) && h >= agora.AddDays(-1) ? h.ToUniversalTime() : agora;
}

/// <summary>
/// Leitura do OTLP/JSON (ExportLogsServiceRequest): só o evento <c>claude_code.api_request</c> interessa — modelo, tokens
/// (entrada, saída, leitura e escrita de cache) e <c>cost_usd</c>, com o <c>session.id</c>. Os demais eventos são ignorados.
/// Inteiros de 64 bits vêm como texto no JSON do OTLP; os dois formatos são aceitos.
/// </summary>
internal static class OtlpLogs
{
    public static IReadOnlyList<UsoModelo> ExtrairUsos(JsonElement corpo, DateTimeOffset agora)
    {
        var usos = new List<UsoModelo>();
        if (corpo.ValueKind != JsonValueKind.Object || !corpo.TryGetProperty("resourceLogs", out var resourceLogs)) return usos;

        foreach (var rl in Itens(resourceLogs))
        {
            var recurso = rl.TryGetProperty("resource", out var r) ? Atributos(r) : [];
            if (!rl.TryGetProperty("scopeLogs", out var scopeLogs)) continue;
            foreach (var sl in Itens(scopeLogs))
            {
                if (!sl.TryGetProperty("logRecords", out var registros)) continue;
                foreach (var registro in Itens(registros))
                {
                    var atributos = Atributos(registro);
                    if (!EhRequisicao(registro, atributos)) continue;

                    var sessao = Texto(atributos, "session.id") ?? Texto(recurso, "session.id");
                    var modelo = Texto(atributos, "model");
                    if (string.IsNullOrWhiteSpace(sessao) || string.IsNullOrWhiteSpace(modelo)) continue;

                    var uso = new UsoTokens(Inteiro(atributos, "input_tokens"), Inteiro(atributos, "output_tokens"),
                        Inteiro(atributos, "cache_read_tokens"), Inteiro(atributos, "cache_creation_tokens"));
                    var custo = Math.Max(0m, Math.Round(Decimal(atributos, "cost_usd"), 6));
                    usos.Add(new UsoModelo(Cortar(sessao, 100), Cortar(modelo, 80), uso, custo, Horario(registro, agora)));
                }
            }
        }
        return usos;
    }

    private static bool EhRequisicao(JsonElement registro, Dictionary<string, JsonElement> atributos)
    {
        var nome = Texto(atributos, "event.name")
                   ?? (registro.TryGetProperty("eventName", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null)
                   ?? (registro.TryGetProperty("body", out var b) ? ValorTexto(b) : null);
        return nome is "api_request" or "claude_code.api_request";
    }

    private static DateTimeOffset Horario(JsonElement registro, DateTimeOffset agora)
    {
        foreach (var campo in new[] { "timeUnixNano", "observedTimeUnixNano" })
            if (registro.TryGetProperty(campo, out var t) && ulong.TryParse(ValorBruto(t), out var nanos) && nanos > 0)
                return Autenticacao.Horario(DateTimeOffset.FromUnixTimeMilliseconds((long)(nanos / 1_000_000)), agora);
        return agora;
    }

    private static Dictionary<string, JsonElement> Atributos(JsonElement e)
    {
        var mapa = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (e.TryGetProperty("attributes", out var lista))
            foreach (var a in Itens(lista))
                if (a.TryGetProperty("key", out var k) && k.ValueKind == JsonValueKind.String && a.TryGetProperty("value", out var v))
                    mapa[k.GetString()!] = v;
        return mapa;
    }

    private static string? Texto(Dictionary<string, JsonElement> a, string chave) => a.TryGetValue(chave, out var v) ? ValorTexto(v) : null;

    private static int Inteiro(Dictionary<string, JsonElement> a, string chave)
        => a.TryGetValue(chave, out var v) && long.TryParse(ValorTexto(v), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n)
            ? (int)Math.Clamp(n, 0, int.MaxValue)
            : 0;

    private static decimal Decimal(Dictionary<string, JsonElement> a, string chave)
        => a.TryGetValue(chave, out var v) && decimal.TryParse(ValorTexto(v), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0m;

    /// <summary>AnyValue do OTLP: { stringValue | intValue | doubleValue | boolValue }.</summary>
    private static string? ValorTexto(JsonElement v)
    {
        if (v.ValueKind != JsonValueKind.Object) return ValorBruto(v);
        foreach (var campo in new[] { "stringValue", "intValue", "doubleValue", "boolValue" })
            if (v.TryGetProperty(campo, out var x)) return ValorBruto(x);
        return null;
    }

    private static string? ValorBruto(JsonElement x) => x.ValueKind switch
    {
        JsonValueKind.String => x.GetString(),
        JsonValueKind.Number => x.GetRawText(),
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        _ => null,
    };

    private static IEnumerable<JsonElement> Itens(JsonElement e) => e.ValueKind == JsonValueKind.Array ? e.EnumerateArray() : [];
    private static string Cortar(string s, int max) => s.Length <= max ? s : s[..max];
}
