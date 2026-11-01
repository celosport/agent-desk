using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Automacoes.Application.Automacoes.ExecutarAutomacao;

/// <summary>As automações que o usuário está rodando agora, para o alerta no celular dizer o que ainda está rodando.</summary>
internal sealed class ResumoAutomacoesEmAndamento(IExecucoesEmAndamento emAndamento) : IResumoEmAndamento
{
    public Task<IReadOnlyList<string>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken)
        => Task.FromResult<IReadOnlyList<string>>(emAndamento.RotulosDe(usuarioId).Select(r => $"Automação {r}").ToList());
}
