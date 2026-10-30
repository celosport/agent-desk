using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Configuracoes.RemoverChaveApi;

/// <summary>Apaga a API key salva (idempotente). Preferências e limite continuam.</summary>
public sealed record RemoverChaveApiCommand(Guid UsuarioId) : ICommand<ConfiguracaoDto>;

internal sealed class RemoverChaveApiHandler(IConfiguracoesRepository repository, TimeProvider clock)
    : ICommandHandler<RemoverChaveApiCommand, ConfiguracaoDto>
{
    public async Task<Result<ConfiguracaoDto>> Handle(RemoverChaveApiCommand command, CancellationToken cancellationToken)
    {
        await repository.SalvarChaveAsync(command.UsuarioId, null, null, clock.GetUtcNow(), cancellationToken);
        var config = await repository.ObterAsync(command.UsuarioId, cancellationToken) ?? ConfiguracaoUsuario.Padrao(command.UsuarioId);
        return ConfiguracaoDto.De(config, chaveLegivel: false);
    }
}
