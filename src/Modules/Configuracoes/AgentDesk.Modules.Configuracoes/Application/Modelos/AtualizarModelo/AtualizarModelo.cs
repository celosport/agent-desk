using FluentValidation;
using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Application.Modelos.CriarModelo;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Modelos.AtualizarModelo;

/// <summary>
/// ADMIN muda nome, preços ou ativa/desativa. O id não muda (é o da API). Preços novos valem para as próximas chamadas:
/// o histórico guarda o preço da época. [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]
/// </summary>
public sealed record AtualizarModeloCommand(
    string ModeloId,
    string? NomeExibicao,
    decimal? PrecoEntradaMTok,
    decimal? PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok,
    bool? Ativo,
    bool? FallbackRecusa = null) : ICommand<ModeloDto>;

internal sealed class AtualizarModeloValidator : AbstractValidator<AtualizarModeloCommand>
{
    public AtualizarModeloValidator()
    {
        RuleFor(x => x.NomeExibicao).NotEmpty().WithMessage("Informe o nome de exibição.").MaximumLength(80);
        RuleFor(x => x.PrecoEntradaMTok).NotNull().WithMessage("Informe o preço de entrada.").Preco();
        RuleFor(x => x.PrecoSaidaMTok).NotNull().WithMessage("Informe o preço de saída.").Preco();
        RuleFor(x => x.PrecoCacheLeituraMTok).Preco();
        RuleFor(x => x.PrecoCacheEscritaMTok).Preco();
    }
}

internal sealed class AtualizarModeloHandler(IModelosRepository repository, TimeProvider clock) : ICommandHandler<AtualizarModeloCommand, ModeloDto>
{
    public async Task<Result<ModeloDto>> Handle(AtualizarModeloCommand command, CancellationToken cancellationToken)
    {
        var atual = await repository.ObterAsync(command.ModeloId, cancellationToken);
        if (atual is null) return ModeloErros.NaoEncontrado;

        var modelo = atual with
        {
            NomeExibicao = command.NomeExibicao!.Trim(),
            PrecoEntradaMTok = command.PrecoEntradaMTok!.Value,
            PrecoSaidaMTok = command.PrecoSaidaMTok!.Value,
            PrecoCacheLeituraMTok = command.PrecoCacheLeituraMTok,
            PrecoCacheEscritaMTok = command.PrecoCacheEscritaMTok,
            Ativo = command.Ativo ?? atual.Ativo,
            FallbackRecusa = command.FallbackRecusa ?? atual.FallbackRecusa,
            AtualizadoEm = clock.GetUtcNow(),
        };
        if (!await repository.AtualizarAsync(modelo, cancellationToken)) return ModeloErros.NaoEncontrado;
        return ModeloDto.De(modelo);
    }
}
