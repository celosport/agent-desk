using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using FluentValidation;

namespace AgentDesk.Modules.Sessoes.Application.Sessoes;

/// <summary>
/// Junta uma sala (projeto) a um grupo, ou tira dela (<c>Grupo</c> vazio). Salas do mesmo grupo aparecem numa sala só no Escritório:
/// serve para worktrees, para o mesmo projeto no PC e na nuvem, ou para vários serviços que trabalham juntos.
/// </summary>
public sealed record DefinirGrupoCommand(Guid UsuarioId, string? ProjetoChave, string? Grupo) : ICommand<bool>;

internal sealed class DefinirGrupoValidator : AbstractValidator<DefinirGrupoCommand>
{
    public DefinirGrupoValidator()
    {
        RuleFor(x => x.ProjetoChave).NotEmpty().Length(12).OverridePropertyName("projetoChave");
        RuleFor(x => x.Grupo).MaximumLength(40).OverridePropertyName("grupo");
    }
}

internal sealed class DefinirGrupoHandler(IGruposRepository grupos) : ICommandHandler<DefinirGrupoCommand, bool>
{
    /// <summary>Salas agrupadas por usuário.</summary>
    public const int LimiteDeSalas = 100;

    public async Task<Result<bool>> Handle(DefinirGrupoCommand command, CancellationToken cancellationToken)
    {
        var nome = string.IsNullOrWhiteSpace(command.Grupo) ? null : string.Join(' ', command.Grupo.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        var gravou = await grupos.DefinirAsync(command.UsuarioId, command.ProjetoChave!, nome, LimiteDeSalas, cancellationToken);
        return gravou ? true : SessaoErros.LimiteDeGrupos;
    }
}
