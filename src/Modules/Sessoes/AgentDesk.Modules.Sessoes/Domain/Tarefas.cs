using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Sessoes.Domain;

/// <summary>
/// JSON/banco: "PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "FALHOU", "CANCELADA". "EXPIRADA" só existe na tela (pendente que ninguém buscou).
/// </summary>
public enum StatusTarefa
{
    Pendente,
    EmAndamento,
    Concluida,
    Falhou,
    Cancelada,
    Expirada,
}

/// <summary>
/// Uma tarefa que o usuário mandou pelo app para o Claude Code rodar no computador dele. O id da tarefa é o id da sessão do Claude Code
/// (<c>claude --session-id</c>): o robô que aparece no Escritório é o desta tarefa. [[ADR-018 - Mandar Tarefa para o Claude Code do PC]]
/// </summary>
internal sealed record Tarefa(
    Guid TarefaId,
    string Maquina,
    string ProjetoChave,
    string Projeto,
    string Texto,
    StatusTarefa Status,
    DateTimeOffset CriadaEm,
    DateTimeOffset? IniciadaEm,
    DateTimeOffset? FinalizadaEm,
    string? Erro);

/// <summary>Pasta que o usuário liberou NO PC (<c>agentdesk-coletor liberar</c>) para receber tarefas. O caminho nunca sai do computador.</summary>
internal sealed record PastaLiberada(string ProjetoChave, string Projeto);

/// <summary>Uma pasta liberada de um computador e quando o coletor dele deu sinal pela última vez.</summary>
internal sealed record PastaDoComputador(string Maquina, string ProjetoChave, string Projeto, DateTimeOffset VistoEm);

internal static class RegrasTarefas
{
    public const int TextoMaximo = 4000;

    /// <summary>Tarefas ainda não terminadas por usuário (pendentes + em andamento).</summary>
    public const int MaximoAbertas = 5;

    public const int PastasPorComputador = 50;

    /// <summary>Quantas tarefas o coletor pega por vez (ele também limita quantas roda ao mesmo tempo).</summary>
    public const int MaximoPorBusca = 5;

    /// <summary>Pendente há mais que isso: o computador provavelmente está desligado. Não é mais entregue e aparece como expirada.</summary>
    public static readonly TimeSpan ValidadePendente = TimeSpan.FromMinutes(10);

    /// <summary>O coletor fica "online" se deu sinal (a cada ~5 s) dentro desta janela.</summary>
    public static readonly TimeSpan JanelaOnline = TimeSpan.FromSeconds(45);

    /// <summary>Em andamento há mais que isso sem resultado: o coletor caiu no meio; aparece como falha.</summary>
    public static readonly TimeSpan LimiteEmAndamento = TimeSpan.FromHours(6);

    public static StatusTarefa StatusVisto(Tarefa t, DateTimeOffset agora) => t.Status switch
    {
        StatusTarefa.Pendente when agora - t.CriadaEm > ValidadePendente => StatusTarefa.Expirada,
        StatusTarefa.EmAndamento when agora - (t.IniciadaEm ?? t.CriadaEm) > LimiteEmAndamento => StatusTarefa.Falhou,
        _ => t.Status,
    };
}

internal static class TarefaErros
{
    public static readonly Error PastaNaoLiberada = Error.NotFound(
        "Sessoes.PastaNaoLiberada", "Esta pasta não está liberada neste computador. Rode \"agentdesk-coletor liberar\" na pasta, no próprio computador.");

    public static readonly Error LimiteDeTarefas = Error.Conflict(
        "Sessoes.LimiteDeTarefas", "Já há 5 tarefas esperando ou rodando. Aguarde alguma terminar (ou cancele uma pendente).");

    public static readonly Error TarefaNaoEncontrada = Error.NotFound("Sessoes.TarefaNaoEncontrada", "Tarefa não encontrada.");

    public static readonly Error TarefaJaIniciada = Error.Conflict(
        "Sessoes.TarefaJaIniciada", "A tarefa já começou ou terminou. Para interromper, use Parar no robô dela.");
}

internal interface ITarefasRepository
{
    /// <summary>Troca a lista de pastas liberadas do computador pela informada e marca que ele deu sinal agora.</summary>
    Task SubstituirPastasAsync(Guid usuarioId, string maquina, IReadOnlyList<PastaLiberada> pastas, DateTimeOffset agora, CancellationToken cancellationToken);

    /// <summary>Marca que o computador deu sinal (a busca de tarefas faz isso a cada poucos segundos).</summary>
    Task RegistrarSinalAsync(Guid usuarioId, string maquina, DateTimeOffset agora, CancellationToken cancellationToken);

    Task<IReadOnlyList<PastaDoComputador>> ListarPastasAsync(Guid usuarioId, CancellationToken cancellationToken);

    /// <summary>A pasta está liberada neste computador? (nome da pasta, ou null)</summary>
    Task<string?> NomeDaPastaAsync(Guid usuarioId, string maquina, string projetoChave, CancellationToken cancellationToken);

    /// <summary>Cria a tarefa pendente se o usuário tem menos de <paramref name="maximoAbertas"/> abertas. False = limite.</summary>
    Task<bool> CriarAsync(Guid usuarioId, Tarefa tarefa, int maximoAbertas, CancellationToken cancellationToken);

    Task<IReadOnlyList<Tarefa>> ListarAsync(Guid usuarioId, int quantas, CancellationToken cancellationToken);

    Task<Tarefa?> ObterAsync(Guid usuarioId, Guid tarefaId, CancellationToken cancellationToken);

    /// <summary>Cancela só se ainda está pendente. False = já começou, terminou ou não existe.</summary>
    Task<bool> CancelarPendenteAsync(Guid usuarioId, Guid tarefaId, DateTimeOffset agora, CancellationToken cancellationToken);

    /// <summary>Entrega ao computador as tarefas pendentes (ainda válidas) e já as marca EM_ANDAMENTO: cada tarefa sai uma vez só.</summary>
    Task<IReadOnlyList<Tarefa>> ReivindicarAsync(Guid usuarioId, string maquina, int limite, DateTimeOffset validasDesde, DateTimeOffset agora,
        CancellationToken cancellationToken);

    /// <summary>Grava o resultado se a tarefa está EM_ANDAMENTO neste computador. False = não encontrada (ou já finalizada).</summary>
    Task<bool> FinalizarAsync(Guid usuarioId, string maquina, Guid tarefaId, StatusTarefa status, string? erro, DateTimeOffset agora,
        CancellationToken cancellationToken);
}
