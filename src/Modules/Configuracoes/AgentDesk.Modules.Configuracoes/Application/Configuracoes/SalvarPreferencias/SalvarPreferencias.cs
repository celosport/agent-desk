using FluentValidation;
using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Configuracoes.SalvarPreferencias;

/// <summary>Modelo padrão (ativo, da tabela de modelos) e limite de gasto mensal opcional em US$.</summary>
public sealed record SalvarPreferenciasCommand(Guid UsuarioId, string? ModeloPadraoId, decimal? LimiteMensalUsd, bool? BloquearAoAtingirLimite)
    : ICommand<ConfiguracaoDto>;

internal sealed class SalvarPreferenciasValidator : AbstractValidator<SalvarPreferenciasCommand>
{
    public SalvarPreferenciasValidator()
    {
        RuleFor(x => x.LimiteMensalUsd)
            .GreaterThan(0).WithMessage("O limite mensal precisa ser maior que zero (ou deixe em branco para não ter limite).")
            .LessThanOrEqualTo(1_000_000).WithMessage("O limite mensal é de no máximo US$ 1.000.000.")
            .PrecisionScale(12, 2, ignoreTrailingZeros: true).WithMessage("Use no máximo 2 casas decimais.");
    }
}

internal sealed class SalvarPreferenciasHandler(
    IConfiguracoesRepository configuracoes, IModelosRepository modelos, ICofreChaves cofre, TimeProvider clock)
    : ICommandHandler<SalvarPreferenciasCommand, ConfiguracaoDto>
{
    public async Task<Result<ConfiguracaoDto>> Handle(SalvarPreferenciasCommand command, CancellationToken cancellationToken)
    {
        var modeloId = string.IsNullOrWhiteSpace(command.ModeloPadraoId) ? null : command.ModeloPadraoId.Trim();
        if (modeloId is not null && await modelos.ObterAsync(modeloId, cancellationToken) is not { Ativo: true })
            return ConfiguracaoErros.ModeloInvalido;

        await configuracoes.SalvarPreferenciasAsync(command.UsuarioId, modeloId, command.LimiteMensalUsd,
            command.BloquearAoAtingirLimite ?? true, clock.GetUtcNow(), cancellationToken);

        var config = await configuracoes.ObterAsync(command.UsuarioId, cancellationToken) ?? ConfiguracaoUsuario.Padrao(command.UsuarioId);
        return ConfiguracaoDto.De(config, cofre.TentarDecifrar(config.ChaveApiCifrada) is not null);
    }
}
