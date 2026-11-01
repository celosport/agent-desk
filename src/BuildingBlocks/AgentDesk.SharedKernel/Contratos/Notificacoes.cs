namespace AgentDesk.SharedKernel.Contratos;

/// <summary>O que o alerta no celular avisa. O usuário liga e desliga cada tipo nas Configurações.</summary>
public enum TipoAlerta
{
    Automacao,
    Sessao,
    Permissao,
}

/// <summary>
/// Implementado pelo módulo Notificacoes: manda o alerta (push do app instalado) a todos os dispositivos do usuário. Quem chama só
/// informa o que aconteceu; o "ainda rodando" vem dos <see cref="IResumoEmAndamento"/>. Nunca lança: falha de push não pode
/// derrubar a automação nem a ingestão de eventos. [[ADR-016 - Alertas no Celular (Push do App)]]
/// </summary>
public interface INotificador
{
    /// <summary>A <paramref name="tag"/> faz um alerta novo substituir o anterior do mesmo assunto no aparelho.</summary>
    Task NotificarAsync(Guid usuarioId, TipoAlerta tipo, string titulo, string corpo, string tag, CancellationToken cancellationToken);
}

/// <summary>Implementado por quem sabe o que está rodando (Sessoes e Automacoes): linhas curtas como "agent-desk: ✏️ Editando api.ts".</summary>
public interface IResumoEmAndamento
{
    Task<IReadOnlyList<string>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken);
}
