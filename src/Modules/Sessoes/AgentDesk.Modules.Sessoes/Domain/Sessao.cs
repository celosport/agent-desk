using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Sessoes.Domain;

/// <summary>JSON/banco: "TRABALHANDO", "ESPERANDO_VOCE", "OCIOSA", "ENCERRADA".</summary>
public enum StatusSessao
{
    Trabalhando,
    EsperandoVoce,
    Ociosa,
    Encerrada,
}

/// <summary>
/// Evento de um hook do Claude Code, já filtrado pelo coletor no PC: só metadados (nome da pasta, ferramenta, arquivo ou comando
/// resumido). Nunca o conteúdo de arquivos nem o texto dos prompts. [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
/// </summary>
internal sealed record EventoHook(
    string SessaoId,
    string Evento,
    string Maquina,
    string Projeto,
    string ProjetoChave,
    string? Ferramenta,
    string? Resumo,
    string? Notificacao,
    string? Modelo,
    DateTimeOffset OcorridoEm);

/// <summary>Uma chamada ao modelo vinda da telemetria (evento OTel <c>claude_code.api_request</c>).</summary>
internal sealed record UsoModelo(string SessaoId, string Modelo, UsoTokens Uso, decimal CustoUsd, DateTimeOffset OcorridoEm);

/// <summary>Como um evento muda a sessão. Status nulo = mantém o atual.</summary>
internal sealed record Transicao(StatusSessao? Status, string? Atividade);

/// <summary>Regras de evento → status e texto do balão (funções puras).</summary>
internal static class Transicoes
{
    /// <summary>Eventos que o coletor manda (o resto é ignorado: o servidor aceita, mas não muda nada).</summary>
    public static readonly IReadOnlySet<string> Conhecidos = new HashSet<string>(StringComparer.Ordinal)
    {
        "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Notification", "Stop",
        "SubagentStart", "SubagentStop", "PreCompact", "SessionEnd",
    };

    public static Transicao De(EventoHook e) => e.Evento switch
    {
        "SessionStart" => new(StatusSessao.Ociosa, "Sessão aberta, esperando o primeiro pedido"),
        "UserPromptSubmit" => new(StatusSessao.Trabalhando, "💭 Pensando…"),
        "PreToolUse" => new(StatusSessao.Trabalhando, Atividade(e.Ferramenta, e.Resumo)),
        "PostToolUse" => new(StatusSessao.Trabalhando, null),
        "PostToolUseFailure" => new(StatusSessao.Trabalhando, $"⚠️ {Nome(e.Ferramenta)} falhou"),
        "SubagentStart" => new(StatusSessao.Trabalhando, $"👥 Chamando subagente{Sufixo(e.Resumo)}"),
        "SubagentStop" => new(StatusSessao.Trabalhando, "💭 Pensando…"),
        "PreCompact" => new(StatusSessao.Trabalhando, "🗜️ Compactando o contexto"),
        "Notification" => e.Notificacao switch
        {
            "permission_prompt" => new(StatusSessao.EsperandoVoce, "✋ Precisa de você: aprovar permissão"),
            "elicitation_dialog" => new(StatusSessao.EsperandoVoce, "✋ Precisa de você: responder uma pergunta"),
            "idle_prompt" => new(StatusSessao.Ociosa, "⏳ Esperando o seu próximo pedido"),
            _ => new(null, null),
        },
        "Stop" => new(StatusSessao.Ociosa, "✅ Terminou"),
        "SessionEnd" => new(StatusSessao.Encerrada, "👋 Sessão encerrada"),
        _ => new(null, null),
    };

    /// <summary>"📖 Lendo api.ts", "💻 Rodando npm test", "🔌 Usando github"...</summary>
    public static string Atividade(string? ferramenta, string? resumo)
    {
        var r = Sufixo(resumo);
        return ferramenta switch
        {
            "Read" => $"📖 Lendo{r}",
            "Edit" or "MultiEdit" or "NotebookEdit" => $"✏️ Editando{r}",
            "Write" => $"📝 Escrevendo{r}",
            "Bash" or "PowerShell" => $"💻 Rodando{r}",
            "Grep" or "Glob" => $"🔎 Procurando{r}",
            "WebFetch" => $"🌐 Abrindo{r}",
            "WebSearch" => "🌐 Pesquisando na web",
            "Task" or "Agent" => $"👥 Chamando subagente{r}",
            "TodoWrite" => "🗒️ Organizando as tarefas",
            { } t when t.StartsWith("mcp__", StringComparison.Ordinal) => $"🔌 Usando {t.Split("__")[1]}",
            null or "" => "🛠️ Trabalhando",
            _ => $"🛠️ Usando {ferramenta}{r}",
        };
    }

    private static string Sufixo(string? resumo) => string.IsNullOrWhiteSpace(resumo) ? "" : " " + resumo.Trim();
    private static string Nome(string? ferramenta) => string.IsNullOrWhiteSpace(ferramenta) ? "A ferramenta" : ferramenta;
}

/// <summary>Sessão como o Escritório mostra (status "visto" pode ser OCIOSA por falta de sinal, ver <see cref="SessaoAoVivo"/>).</summary>
internal sealed record Sessao(
    string SessaoId,
    string Maquina,
    string Projeto,
    string ProjetoChave,
    StatusSessao Status,
    string? Atividade,
    string? Modelo,
    UsoTokens Uso,
    decimal CustoUsd,
    int Pedidos,
    DateTimeOffset IniciadaEm,
    DateTimeOffset UltimaAtividadeEm,
    DateTimeOffset? EncerradaEm);

internal static class SessaoAoVivo
{
    /// <summary>Sem nenhum evento há tanto tempo, quem estava "trabalhando" provavelmente travou ou fechou o terminal.</summary>
    public static readonly TimeSpan SemSinal = TimeSpan.FromMinutes(30);

    /// <summary>Sessões ainda abertas há mais disso saem do Escritório (continuam no histórico).</summary>
    public static readonly TimeSpan ForaDoEscritorio = TimeSpan.FromHours(12);

    /// <summary>Encerradas continuam na sala só um pouco (o robô "se despede").</summary>
    public static readonly TimeSpan DespedidaEncerrada = TimeSpan.FromMinutes(2);

    public static StatusSessao StatusVisto(Sessao s, DateTimeOffset agora)
        => s.Status is StatusSessao.Trabalhando or StatusSessao.EsperandoVoce && agora - s.UltimaAtividadeEm > SemSinal
            ? StatusSessao.Ociosa
            : s.Status;
}

internal interface ISessoesRepository
{
    /// <summary>Cria a sessão se for nova e aplica o evento (status, atividade, modelo) + guarda o evento na linha do tempo.</summary>
    Task AplicarEventoAsync(Guid usuarioId, EventoHook evento, Transicao transicao, CancellationToken cancellationToken);

    /// <summary>Soma o uso na sessão (cria um registro provisório se o evento de telemetria chegar antes dos hooks) e no total do dia.</summary>
    Task RegistrarUsoAsync(Guid usuarioId, UsoModelo uso, DateOnly diaLocal, CancellationToken cancellationToken);

    /// <summary>Sessões com atividade desde <paramref name="desde"/> (exclui encerradas há mais de <paramref name="encerradasDesde"/>).</summary>
    Task<IReadOnlyList<Sessao>> ListarAoVivoAsync(Guid usuarioId, DateTimeOffset desde, DateTimeOffset encerradasDesde,
        CancellationToken cancellationToken);

    Task<int> LimparEventosAntesDeAsync(DateTimeOffset limite, CancellationToken cancellationToken);
}
