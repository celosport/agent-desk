using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Configuracoes.ObterConfiguracao;

/// <summary>Configurações do usuário do token. Quem nunca salvou nada recebe o padrão (sem chave, sem limite).</summary>
public sealed record ObterConfiguracaoQuery(Guid UsuarioId) : IQuery<ConfiguracaoDto>;

internal sealed class ObterConfiguracaoHandler(IConfiguracoesRepository repository, ICofreChaves cofre)
    : IQueryHandler<ObterConfiguracaoQuery, ConfiguracaoDto>
{
    public async Task<Result<ConfiguracaoDto>> Handle(ObterConfiguracaoQuery query, CancellationToken cancellationToken)
    {
        var config = await repository.ObterAsync(query.UsuarioId, cancellationToken) ?? ConfiguracaoUsuario.Padrao(query.UsuarioId);
        return ConfiguracaoDto.De(config, cofre.TentarDecifrar(config.ChaveApiCifrada) is not null);
    }
}
