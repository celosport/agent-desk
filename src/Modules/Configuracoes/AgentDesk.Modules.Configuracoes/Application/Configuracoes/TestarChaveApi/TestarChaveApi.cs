using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Integracoes;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Configuracoes.TestarChaveApi;

/// <summary>
/// Confere na Anthropic a chave SALVA (ela não vem do navegador). Não gasta tokens.
/// Erros: Configuracoes.ChaveNaoConfigurada (422), Anthropic.ChaveInvalida (422), Anthropic.LimiteDeTaxa / Anthropic.Indisponivel (503).
/// </summary>
public sealed record TestarChaveApiCommand(Guid UsuarioId) : ICommand<TesteChaveDto>;

internal sealed class TestarChaveApiHandler(IConfiguracoesRepository repository, ICofreChaves cofre, IClienteAnthropic anthropic, TimeProvider clock)
    : ICommandHandler<TestarChaveApiCommand, TesteChaveDto>
{
    public async Task<Result<TesteChaveDto>> Handle(TestarChaveApiCommand command, CancellationToken cancellationToken)
    {
        var config = await repository.ObterAsync(command.UsuarioId, cancellationToken);
        var chave = cofre.TentarDecifrar(config?.ChaveApiCifrada);
        if (chave is null) return ConfiguracaoErros.ChaveNaoConfigurada;

        var teste = await anthropic.TestarChaveAsync(chave, cancellationToken);
        if (teste.IsFailure) return teste.Error;
        return new TesteChaveDto(true, clock.GetUtcNow());
    }
}
