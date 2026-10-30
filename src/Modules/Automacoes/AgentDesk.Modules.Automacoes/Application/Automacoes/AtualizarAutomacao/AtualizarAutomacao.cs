using FluentValidation;
using AgentDesk.Modules.Automacoes.Application.DTOs;
using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Automacoes.Application.Automacoes.AtualizarAutomacao;

/// <summary>ADMIN edita o prompt, o modelo (vazio = padrão de cada usuário), o max_tokens e se a automação aparece.</summary>
public sealed record AtualizarAutomacaoCommand(
    Guid AutomacaoId,
    string? Nome,
    string? Descricao,
    string? PromptSistema,
    string? ModeloMensagem,
    string? ModeloId,
    int? MaxTokens,
    bool? Ativa) : ICommand<AutomacaoDto>;

internal sealed class AtualizarAutomacaoValidator : AbstractValidator<AtualizarAutomacaoCommand>
{
    public AtualizarAutomacaoValidator()
    {
        RuleFor(x => x.Nome).NotEmpty().WithMessage("Informe o nome.").MaximumLength(80);
        RuleFor(x => x.Descricao).NotEmpty().WithMessage("Informe a descrição.").MaximumLength(300);
        RuleFor(x => x.PromptSistema).NotEmpty().WithMessage("Informe o prompt de sistema.").MaximumLength(20_000);
        RuleFor(x => x.ModeloMensagem).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Informe o modelo da mensagem.")
            .MaximumLength(20_000)
            .Must(m => m!.Contains(Automacao.MarcadorEntrada, StringComparison.Ordinal))
            .WithMessage("O modelo da mensagem precisa ter {{entrada}} onde entra o texto do usuário.");
        RuleFor(x => x.MaxTokens).NotNull().WithMessage("Informe o máximo de tokens da resposta.")
            .InclusiveBetween(1, 64_000).WithMessage("O máximo de tokens vai de 1 a 64.000.");
    }
}

internal sealed class AtualizarAutomacaoHandler(IAutomacoesRepository repository, IConfiguracoesDeUso configuracoes, TimeProvider clock)
    : ICommandHandler<AtualizarAutomacaoCommand, AutomacaoDto>
{
    public async Task<Result<AutomacaoDto>> Handle(AtualizarAutomacaoCommand command, CancellationToken cancellationToken)
    {
        var atual = await repository.ObterAsync(command.AutomacaoId, cancellationToken);
        if (atual is null) return AutomacaoErros.NaoEncontrada;

        var modeloId = string.IsNullOrWhiteSpace(command.ModeloId) ? null : command.ModeloId.Trim();
        if (modeloId is not null && await configuracoes.ObterModeloAsync(modeloId, cancellationToken) is not { Ativo: true })
            return AutomacaoErros.ModeloInvalido;

        var automacao = atual with
        {
            Nome = command.Nome!.Trim(),
            Descricao = command.Descricao!.Trim(),
            PromptSistema = command.PromptSistema!.Trim(),
            ModeloMensagem = command.ModeloMensagem!.Trim(),
            ModeloId = modeloId,
            MaxTokens = command.MaxTokens!.Value,
            Ativa = command.Ativa ?? atual.Ativa,
            AtualizadaEm = clock.GetUtcNow(),
        };
        if (!await repository.AtualizarAsync(automacao, cancellationToken)) return AutomacaoErros.NaoEncontrada;
        return AutomacaoDto.De(automacao);
    }
}
