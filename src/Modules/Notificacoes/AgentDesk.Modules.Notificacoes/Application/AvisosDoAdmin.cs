using FluentValidation;
using AgentDesk.Modules.Notificacoes.Domain;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Notificacoes.Application;

/// <summary>Um usuário na lista do ADMIN, com quantos aparelhos já aceitaram alertas (sem aparelho, o push não tem para onde ir).</summary>
public sealed record DestinatarioDto(Guid UsuarioId, string Nome, string Email, int Aparelhos, bool EhAdmin);

/// <summary>Resultado do aviso: quantas pessoas foram escolhidas, em quantas o push chegou e quantas não têm aparelho com alertas.</summary>
public sealed record EnvioAvisoDto(int Escolhidos, int Alcancados, int SemAparelho, int Falhas);

// ---- lista de quem pode receber ----

public sealed record ListarDestinatariosQuery : IQuery<IReadOnlyList<DestinatarioDto>>;

internal sealed class ListarDestinatariosHandler(INotificacoesRepository repositorio, IDiretorioUsuarios usuarios)
    : IQueryHandler<ListarDestinatariosQuery, IReadOnlyList<DestinatarioDto>>
{
    public async Task<Result<IReadOnlyList<DestinatarioDto>>> Handle(ListarDestinatariosQuery query, CancellationToken cancellationToken)
    {
        var todos = await usuarios.ListarAsync(cancellationToken);
        var aparelhos = (await repositorio.ListarDispositivosDeAsync(todos.Select(u => u.UsuarioId).ToList(), cancellationToken))
            .GroupBy(d => d.UsuarioId).ToDictionary(g => g.Key, g => g.Count());
        return todos.Select(u => new DestinatarioDto(u.UsuarioId, u.Nome, u.Email, aparelhos.GetValueOrDefault(u.UsuarioId), u.EhAdmin)).ToList();
    }
}

// ---- aviso do ADMIN ----

/// <param name="UsuarioIds">Quem recebe; <c>null</c> = todos os usuários.</param>
/// <param name="Url">Para onde o toque no alerta leva dentro do app (caminho que começa com "/").</param>
public sealed record EnviarAvisoCommand(IReadOnlyList<Guid>? UsuarioIds, string? Titulo, string? Mensagem, string? Url) : ICommand<EnvioAvisoDto>;

internal sealed class EnviarAvisoValidator : AbstractValidator<EnviarAvisoCommand>
{
    public EnviarAvisoValidator()
    {
        RuleFor(x => x.Titulo).NotEmpty().MaximumLength(60).OverridePropertyName("titulo");
        RuleFor(x => x.Mensagem).NotEmpty().MaximumLength(240).OverridePropertyName("mensagem");
        RuleFor(x => x.UsuarioIds).Must(ids => ids is null || ids.Count > 0).WithMessage("Escolha pelo menos uma pessoa.")
            .Must(ids => ids is null || ids.Count <= 1000).WithMessage("Escolha no máximo 1000 pessoas.").OverridePropertyName("usuarioIds");
        // Só caminhos do próprio app: uma URL externa no alerta seria um jeito de levar o usuário para outro site
        RuleFor(x => x.Url).Must(u => string.IsNullOrEmpty(u) || (u.StartsWith('/') && !u.StartsWith("//") && u.Length <= 200))
            .WithMessage("Use um caminho do app, como /entrar.").OverridePropertyName("url");
    }
}

internal sealed class EnviarAvisoHandler(INotificacoesRepository repositorio, IDiretorioUsuarios usuarios, Notificador notificador)
    : ICommandHandler<EnviarAvisoCommand, EnvioAvisoDto>
{
    public async Task<Result<EnvioAvisoDto>> Handle(EnviarAvisoCommand command, CancellationToken cancellationToken)
    {
        // Ids que não são de nenhum usuário são ignorados
        var existentes = (await usuarios.ListarAsync(cancellationToken)).Select(u => u.UsuarioId).ToHashSet();
        var escolhidos = command.UsuarioIds is null ? existentes : command.UsuarioIds.Where(existentes.Contains).ToHashSet();

        var porUsuario = (await repositorio.ListarDispositivosDeAsync(escolhidos, cancellationToken))
            .GroupBy(d => d.UsuarioId).ToList();

        var alcancados = 0;
        foreach (var aparelhos in porUsuario)
        {
            // Um aparelho com problema não impede os outros usuários de receberem
            try
            {
                var entregues = await notificador.EnviarAsync(aparelhos.ToList(), command.Titulo!.Trim(), command.Mensagem!.Trim(), "aviso-admin",
                    cancellationToken, string.IsNullOrEmpty(command.Url) ? "/" : command.Url);
                if (entregues > 0) alcancados++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { }
        }

        var semAparelho = escolhidos.Count - porUsuario.Count;
        return new EnvioAvisoDto(escolhidos.Count, alcancados, semAparelho, porUsuario.Count - alcancados);
    }
}
