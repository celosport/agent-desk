using AgentDesk.Modules.Tarefas.Domain;

namespace AgentDesk.Modules.Tarefas.Application.DTOs;

// Contratos JSON do módulo: DTOs de saída são records públicos; o domínio (internal) nunca vaza pela API.

public sealed record TarefaDto(Guid TarefaId, string Titulo, StatusTarefa Status, DateTimeOffset CriadaEm, DateTimeOffset? ConcluidaEm)
{
    internal static TarefaDto De(Tarefa t) => new(t.TarefaId, t.Titulo, t.Status, t.CriadaEm, t.ConcluidaEm);
}

public sealed record CriarTarefaRequestDto(string? Titulo);
