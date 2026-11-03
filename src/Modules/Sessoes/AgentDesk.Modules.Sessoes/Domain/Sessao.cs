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
    DateTimeOffset OcorridoEm,
    /// <summary>Preenchidos quando o hook roda dentro de um subagente (<c>agent_id</c> e <c>agent_type</c>).</summary>
    string? AgenteId = null,
    string? AgenteTipo = null)
{
    public bool DeSubagente => AgenteId is not null;
}

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

    /// <summary>
    /// Como o evento muda a SESSÃO. Ferramentas usadas dentro de um subagente mexem só no robô do subagente (<see cref="DoSubagente"/>):
    /// a sessão continua mostrando "Chamando subagente…" e só ganha o horário da atividade.
    /// </summary>
    public static Transicao De(EventoHook e)
        => e.DeSubagente && e.Evento is "PreToolUse" or "PostToolUse" or "PostToolUseFailure" ? new(null, null) : DaSessao(e);

    /// <summary>Como o evento muda o robô do subagente (status nulo = mantém). Só vale quando o evento traz <c>agent_id</c>.</summary>
    public static Transicao DoSubagente(EventoHook e) => e.Evento switch
    {
        "SubagentStart" => new(StatusSessao.Trabalhando, "💭 Pensando…"),
        "SubagentStop" => new(StatusSessao.Encerrada, "✅ Terminou"),
        "PreToolUse" => new(StatusSessao.Trabalhando, Atividade(e.Ferramenta, e.Resumo)),
        "PostToolUse" => new(StatusSessao.Trabalhando, null),
        "PostToolUseFailure" => new(StatusSessao.Trabalhando, $"⚠️ {Nome(e.Ferramenta)} falhou"),
        "SessionEnd" => new(StatusSessao.Encerrada, "👋 Sessão encerrada"),
        _ => new(null, null),
    };

    private static Transicao DaSessao(EventoHook e) => e.Evento switch
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
    DateTimeOffset? EncerradaEm,
    /// <summary>Lugar (0 a 7) na sala do projeto; liga a sessão ao nome e à aparência salvos na Equipe. Nulo em sessões antigas.</summary>
    short? Lugar = null);

internal static class SessaoAoVivo
{
    /// <summary>Sem nenhum evento há tanto tempo, quem estava "trabalhando" provavelmente travou ou fechou o terminal.</summary>
    public static readonly TimeSpan SemSinal = TimeSpan.FromMinutes(30);

    /// <summary>Sessões ainda abertas há mais disso saem do Escritório (continuam no histórico).</summary>
    public static readonly TimeSpan ForaDoEscritorio = TimeSpan.FromHours(12);

    /// <summary>Encerradas continuam na sala só um pouco (o robô "se despede").</summary>
    public static readonly TimeSpan DespedidaEncerrada = TimeSpan.FromMinutes(15);

    /// <summary>Subagente ainda "aberto" sem nenhum sinal há isso: o SubagentStop se perdeu, então ele sai da sala.</summary>
    public static readonly TimeSpan SubagenteSemSinal = TimeSpan.FromMinutes(10);

    /// <summary>Subagente que terminou fica só um instante (o ajudante "se despede" e some).</summary>
    public static readonly TimeSpan DespedidaSubagente = TimeSpan.FromSeconds(20);

    public static StatusSessao StatusVisto(Sessao s, DateTimeOffset agora)
        => s.Status is StatusSessao.Trabalhando or StatusSessao.EsperandoVoce && agora - s.UltimaAtividadeEm > SemSinal
            ? StatusSessao.Ociosa
            : s.Status;
}

/// <summary>Um subagente que uma sessão chamou (robô ajudante). Status: Trabalhando ou Encerrada.</summary>
internal sealed record Subagente(
    string SessaoId,
    string AgenteId,
    string Tipo,
    StatusSessao Status,
    string? Atividade,
    DateTimeOffset IniciadoEm,
    DateTimeOffset UltimaAtividadeEm);

/// <summary>Salas juntas num grupo escolhido pelo usuário (projeto_chave → nome do grupo).</summary>
internal interface IGruposRepository
{
    Task<IReadOnlyDictionary<string, string>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken);

    /// <summary>Põe a sala no grupo (ou tira, com <paramref name="grupo"/> nulo). Devolve false se passar do limite de salas agrupadas.</summary>
    Task<bool> DefinirAsync(Guid usuarioId, string projetoChave, string? grupo, int limite, CancellationToken cancellationToken);
}

internal interface ISessoesRepository
{
    /// <summary>
    /// Cria a sessão se for nova e aplica o evento (status, atividade, modelo) + guarda o evento na linha do tempo.
    /// Se o evento traz <c>agent_id</c>, também cria/atualiza o robô do subagente.
    /// </summary>
    Task AplicarEventoAsync(Guid usuarioId, EventoHook evento, Transicao transicao, CancellationToken cancellationToken);

    /// <summary>Soma o uso na sessão (cria um registro provisório se o evento de telemetria chegar antes dos hooks) e no total do dia.</summary>
    Task RegistrarUsoAsync(Guid usuarioId, UsoModelo uso, DateOnly diaLocal, CancellationToken cancellationToken);

    /// <summary>Sessões com atividade desde <paramref name="desde"/> (exclui encerradas há mais de <paramref name="encerradasDesde"/>).</summary>
    Task<IReadOnlyList<Sessao>> ListarAoVivoAsync(Guid usuarioId, DateTimeOffset desde, DateTimeOffset encerradasDesde,
        CancellationToken cancellationToken);

    /// <summary>Subagentes abertos com sinal desde <paramref name="ativosDesde"/> e os que terminaram depois de <paramref name="encerradosDesde"/>.</summary>
    Task<IReadOnlyList<Subagente>> ListarSubagentesAsync(Guid usuarioId, DateTimeOffset ativosDesde, DateTimeOffset encerradosDesde,
        CancellationToken cancellationToken);

    Task<int> LimparEventosAntesDeAsync(DateTimeOffset limite, CancellationToken cancellationToken);
}
