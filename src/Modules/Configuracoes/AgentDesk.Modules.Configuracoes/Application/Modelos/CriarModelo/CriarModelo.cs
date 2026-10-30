using System.Text.RegularExpressions;
using FluentValidation;
using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Modelos.CriarModelo;

/// <summary>
/// ADMIN cadastra um modelo novo da Anthropic (id exatamente como na API) com os preços por milhão de tokens.
/// <c>FallbackRecusa</c>: liga o fallback da Anthropic quando o classificador recusa (só nos modelos que têm fallback no servidor).
/// </summary>
public sealed record CriarModeloCommand(
    string? ModeloId,
    string? NomeExibicao,
    decimal? PrecoEntradaMTok,
    decimal? PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok,
    bool? FallbackRecusa = null) : ICommand<ModeloDto>;

internal sealed partial class CriarModeloValidator : AbstractValidator<CriarModeloCommand>
{
    [GeneratedRegex("^[a-z0-9][a-z0-9.-]{1,79}$")]
    private static partial Regex IdValido();

    public CriarModeloValidator()
    {
        RuleFor(x => x.ModeloId).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Informe o id do modelo (ex.: claude-opus-5-5).")
            .Must(id => IdValido().IsMatch(id!.Trim())).WithMessage("Use o id da API: letras minúsculas, números, \"-\" e \".\" (ex.: claude-opus-5-5).");
        RuleFor(x => x.NomeExibicao).NotEmpty().WithMessage("Informe o nome de exibição.").MaximumLength(80);
        RuleFor(x => x.PrecoEntradaMTok).NotNull().WithMessage("Informe o preço de entrada.").Preco();
        RuleFor(x => x.PrecoSaidaMTok).NotNull().WithMessage("Informe o preço de saída.").Preco();
        RuleFor(x => x.PrecoCacheLeituraMTok).Preco();
        RuleFor(x => x.PrecoCacheEscritaMTok).Preco();
    }
}

internal static class RegrasPreco
{
    /// <summary>Preço em US$ por milhão de tokens: de 0 a 10.000, com até 4 casas (NUMERIC(12,4) no banco). Nulo passa.</summary>
    public static IRuleBuilderOptions<T, decimal?> Preco<T>(this IRuleBuilder<T, decimal?> regra) => regra
        .GreaterThanOrEqualTo(0).WithMessage("O preço não pode ser negativo.")
        .LessThanOrEqualTo(10_000).WithMessage("O preço é de no máximo US$ 10.000 por milhão de tokens.")
        .PrecisionScale(12, 4, ignoreTrailingZeros: true).WithMessage("Use no máximo 4 casas decimais.");
}

internal sealed class CriarModeloHandler(IModelosRepository repository, TimeProvider clock) : ICommandHandler<CriarModeloCommand, ModeloDto>
{
    public async Task<Result<ModeloDto>> Handle(CriarModeloCommand command, CancellationToken cancellationToken)
    {
        var modelo = new ModeloClaude(command.ModeloId!.Trim(), command.NomeExibicao!.Trim(), command.PrecoEntradaMTok!.Value,
            command.PrecoSaidaMTok!.Value, command.PrecoCacheLeituraMTok, command.PrecoCacheEscritaMTok, true, command.FallbackRecusa ?? false, clock.GetUtcNow());
        if (!await repository.InserirAsync(modelo, cancellationToken)) return ModeloErros.JaExiste;
        return ModeloDto.De(modelo);
    }
}
