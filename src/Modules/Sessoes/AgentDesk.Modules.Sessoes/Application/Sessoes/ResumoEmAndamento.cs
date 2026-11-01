using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Sessoes.Application.Sessoes;

/// <summary>As sessões do Claude Code que estão trabalhando agora, para o alerta dizer o que ainda está rodando ("agent-desk: ✏️ Editando api.ts").</summary>
internal sealed class ResumoSessoesEmAndamento(ISessoesRepository sessoes, TimeProvider clock) : IResumoEmAndamento
{
    public async Task<IReadOnlyList<string>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var lista = await sessoes.ListarAoVivoAsync(usuarioId, agora - SessaoAoVivo.ForaDoEscritorio, agora - SessaoAoVivo.DespedidaEncerrada, cancellationToken);
        return lista
            .Where(s => SessaoAoVivo.StatusVisto(s, agora) == StatusSessao.Trabalhando)
            .OrderBy(s => s.IniciadaEm)
            .Select(s => string.IsNullOrWhiteSpace(s.Atividade) ? s.Projeto : $"{s.Projeto}: {s.Atividade}")
            .ToList();
    }
}
