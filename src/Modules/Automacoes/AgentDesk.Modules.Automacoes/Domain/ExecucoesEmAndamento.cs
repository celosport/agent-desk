using System.Collections.Concurrent;

namespace AgentDesk.Modules.Automacoes.Domain;

/// <summary>
/// Execuções de automação em andamento neste servidor, para o usuário poder cancelar. O id vem do app (ele precisa dele antes de a
/// resposta chegar). Só o dono cancela; id de outro usuário é tratado como inexistente. Fica em memória: reiniciar o servidor encerra
/// as chamadas de qualquer forma. [[ADR-012 - Cancelar Tarefa do Agente]]
/// </summary>
internal interface IExecucoesEmAndamento
{
    /// <summary>Null se o id já está em uso. Descartar o resultado remove a execução do registro.</summary>
    ExecucaoCancelavel? Iniciar(Guid execucaoId, Guid usuarioId, string rotulo);

    /// <summary>Nomes das automações que o usuário está rodando agora (para o alerta no celular dizer o que ainda está rodando).</summary>
    IReadOnlyList<string> RotulosDe(Guid usuarioId);

    /// <summary>False se não existe (já terminou, nunca existiu ou é de outro usuário).</summary>
    bool Cancelar(Guid execucaoId, Guid usuarioId);
}

internal sealed class ExecucaoCancelavel : IDisposable
{
    private readonly Action _remover;
    private readonly CancellationTokenSource _origem = new();

    public ExecucaoCancelavel(Guid usuarioId, string rotulo, Action remover)
    {
        UsuarioId = usuarioId;
        Rotulo = rotulo;
        _remover = remover;
    }

    public Guid UsuarioId { get; }
    public string Rotulo { get; }
    public CancellationToken Token => _origem.Token;

    public void Cancelar()
    {
        try { _origem.Cancel(); }
        catch (ObjectDisposedException) { /* terminou no mesmo instante */ }
    }

    public void Dispose()
    {
        _remover();
        _origem.Dispose();
    }
}

internal sealed class ExecucoesEmAndamento : IExecucoesEmAndamento
{
    private readonly ConcurrentDictionary<Guid, ExecucaoCancelavel> _execucoes = new();

    public ExecucaoCancelavel? Iniciar(Guid execucaoId, Guid usuarioId, string rotulo)
    {
        var execucao = new ExecucaoCancelavel(usuarioId, rotulo, () => _execucoes.TryRemove(execucaoId, out _));
        if (_execucoes.TryAdd(execucaoId, execucao)) return execucao;
        // Não remove a do outro: o Dispose acima só roda para quem entrou no registro
        return null;
    }

    public IReadOnlyList<string> RotulosDe(Guid usuarioId)
        => _execucoes.Values.Where(e => e.UsuarioId == usuarioId).Select(e => e.Rotulo).Order().ToList();

    public bool Cancelar(Guid execucaoId, Guid usuarioId)
    {
        if (!_execucoes.TryGetValue(execucaoId, out var execucao) || execucao.UsuarioId != usuarioId) return false;
        execucao.Cancelar();
        return true;
    }
}
