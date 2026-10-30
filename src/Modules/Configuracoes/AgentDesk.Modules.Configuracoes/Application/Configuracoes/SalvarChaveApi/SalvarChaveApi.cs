using FluentValidation;
using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Configuracoes.SalvarChaveApi;

/// <summary>Grava a API key cifrada. A resposta traz só a versão mascarada — a chave nunca volta para o navegador.</summary>
public sealed record SalvarChaveApiCommand(Guid UsuarioId, string? ChaveApi) : ICommand<ConfiguracaoDto>;

internal sealed class SalvarChaveApiValidator : AbstractValidator<SalvarChaveApiCommand>
{
    public const string Prefixo = "sk-ant-";

    public SalvarChaveApiValidator()
    {
        RuleFor(x => x.ChaveApi).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Cole a sua API key da Anthropic.")
            .Must(c => c!.Trim().StartsWith(Prefixo, StringComparison.Ordinal)).WithMessage("A API key da Anthropic começa com \"sk-ant-\".")
            .Must(c => c!.Trim().Length is >= 20 and <= 400).WithMessage("Esta chave não parece completa. Copie de novo no Console da Anthropic.")
            .Must(c => !c!.Trim().Any(char.IsWhiteSpace)).WithMessage("A chave não pode ter espaços no meio.");
    }
}

internal sealed class SalvarChaveApiHandler(IConfiguracoesRepository repository, ICofreChaves cofre, TimeProvider clock)
    : ICommandHandler<SalvarChaveApiCommand, ConfiguracaoDto>
{
    public async Task<Result<ConfiguracaoDto>> Handle(SalvarChaveApiCommand command, CancellationToken cancellationToken)
    {
        var chave = command.ChaveApi!.Trim();
        await repository.SalvarChaveAsync(command.UsuarioId, cofre.Cifrar(chave), chave[^4..], clock.GetUtcNow(), cancellationToken);

        var config = await repository.ObterAsync(command.UsuarioId, cancellationToken) ?? ConfiguracaoUsuario.Padrao(command.UsuarioId);
        return ConfiguracaoDto.De(config, chaveLegivel: true);
    }
}
