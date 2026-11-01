using FluentValidation;
using AgentDesk.Modules.Notificacoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Notificacoes.Application;

public sealed record DispositivoDto(Guid DispositivoId, string Nome, string Endpoint, DateTimeOffset CriadoEm);

public sealed record PreferenciasAlertaDto(bool Automacoes, bool Sessoes, bool Permissoes);

/// <summary>O que a tela de Configurações precisa: a chave pública para o aparelho se inscrever, os aparelhos já inscritos e o que avisar.</summary>
public sealed record NotificacoesDto(string ChavePublica, IReadOnlyList<DispositivoDto> Dispositivos, PreferenciasAlertaDto Preferencias);

public sealed record EnvioTesteDto(int Entregues);

internal static class NotificacoesErros
{
    public static readonly Error SemDispositivos = Error.Conflict(
        "Notificacoes.SemDispositivos", "Nenhum aparelho está recebendo alertas. Ative os alertas neste aparelho primeiro.");

    public static readonly Error DispositivosDemais = Error.Conflict(
        "Notificacoes.DispositivosDemais", "Há aparelhos demais recebendo alertas. Desative algum antes de adicionar outro.");

    public static readonly Error NaoEntregue = Error.Unavailable(
        "Notificacoes.NaoEntregue", "O serviço de push do aparelho não aceitou o alerta de teste. Tente de novo em instantes.");
}

// ---- consulta ----

public sealed record ObterNotificacoesQuery(Guid UsuarioId) : IQuery<NotificacoesDto>;

internal sealed class ObterNotificacoesHandler(INotificacoesRepository repositorio) : IQueryHandler<ObterNotificacoesQuery, NotificacoesDto>
{
    public async Task<Result<NotificacoesDto>> Handle(ObterNotificacoesQuery query, CancellationToken cancellationToken)
    {
        var chaves = await repositorio.ObterOuCriarChavesAsync(ChavesVapid.Gerar, cancellationToken);
        var dispositivos = await repositorio.ListarDispositivosAsync(query.UsuarioId, cancellationToken);
        var p = await repositorio.ObterPreferenciasAsync(query.UsuarioId, cancellationToken);
        return new NotificacoesDto(chaves.Publica, dispositivos.Select(Mapear).ToList(), new PreferenciasAlertaDto(p.Automacoes, p.Sessoes, p.Permissoes));
    }

    internal static DispositivoDto Mapear(Dispositivo d) => new(d.DispositivoId, d.Nome, d.Endpoint, d.CriadoEm);
}

// ---- aparelho aceita os alertas ----

public sealed record RegistrarDispositivoCommand(Guid UsuarioId, string? Endpoint, string? P256dh, string? Auth, string? Nome) : ICommand<DispositivoDto>;

internal sealed class RegistrarDispositivoValidator : AbstractValidator<RegistrarDispositivoCommand>
{
    /// <summary>
    /// O servidor vai fazer uma requisição para este endereço, então só serviços de push conhecidos entram (sem isso o campo seria um
    /// jeito de fazer o servidor acessar qualquer endereço).
    /// </summary>
    private static readonly string[] ServicosDePush =
        ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com", "push.microsoft.com"];

    public RegistrarDispositivoValidator()
    {
        RuleFor(x => x.Endpoint).NotEmpty().MaximumLength(2048)
            .Must(EhServicoDePush).WithMessage("Endereço de push não reconhecido.").OverridePropertyName("endpoint");
        RuleFor(x => x.P256dh).NotEmpty().MaximumLength(200).Matches("^[A-Za-z0-9_-]+$").OverridePropertyName("p256dh");
        RuleFor(x => x.Auth).NotEmpty().MaximumLength(100).Matches("^[A-Za-z0-9_-]+$").OverridePropertyName("auth");
        RuleFor(x => x.Nome).MaximumLength(80).OverridePropertyName("nome");
    }

    internal static bool EhServicoDePush(string? endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps || uri.Port != 443) return false;
        var host = uri.IdnHost.ToLowerInvariant();
        return ServicosDePush.Any(s => host == s || host.EndsWith("." + s, StringComparison.Ordinal));
    }
}

internal sealed class RegistrarDispositivoHandler(INotificacoesRepository repositorio, TimeProvider clock)
    : ICommandHandler<RegistrarDispositivoCommand, DispositivoDto>
{
    private const int MaximoPorUsuario = 10;

    public async Task<Result<DispositivoDto>> Handle(RegistrarDispositivoCommand command, CancellationToken cancellationToken)
    {
        var existentes = await repositorio.ListarDispositivosAsync(command.UsuarioId, cancellationToken);
        if (existentes.Count >= MaximoPorUsuario && existentes.All(d => d.Endpoint != command.Endpoint)) return NotificacoesErros.DispositivosDemais;

        var nome = string.IsNullOrWhiteSpace(command.Nome) ? "Aparelho" : command.Nome.Trim();
        var salvo = await repositorio.SalvarDispositivoAsync(
            new Dispositivo(Guid.NewGuid(), command.UsuarioId, command.Endpoint!, command.P256dh!, command.Auth!, nome, clock.GetUtcNow()), cancellationToken);
        return ObterNotificacoesHandler.Mapear(salvo);
    }
}

public sealed record RemoverDispositivoCommand(Guid UsuarioId, string? Endpoint) : ICommand<bool>;

internal sealed class RemoverDispositivoHandler(INotificacoesRepository repositorio) : ICommandHandler<RemoverDispositivoCommand, bool>
{
    /// <summary>Remover o que já não existe não é erro: o aparelho só quer ficar sem alertas.</summary>
    public async Task<Result<bool>> Handle(RemoverDispositivoCommand command, CancellationToken cancellationToken)
        => string.IsNullOrWhiteSpace(command.Endpoint) || await repositorio.RemoverDispositivoAsync(command.UsuarioId, command.Endpoint, cancellationToken);
}

// ---- preferências e teste ----

public sealed record SalvarPreferenciasCommand(Guid UsuarioId, bool Automacoes, bool Sessoes, bool Permissoes) : ICommand<PreferenciasAlertaDto>;

internal sealed class SalvarPreferenciasHandler(INotificacoesRepository repositorio) : ICommandHandler<SalvarPreferenciasCommand, PreferenciasAlertaDto>
{
    public async Task<Result<PreferenciasAlertaDto>> Handle(SalvarPreferenciasCommand command, CancellationToken cancellationToken)
    {
        await repositorio.SalvarPreferenciasAsync(command.UsuarioId, new PreferenciasAlerta(command.Automacoes, command.Sessoes, command.Permissoes), cancellationToken);
        return new PreferenciasAlertaDto(command.Automacoes, command.Sessoes, command.Permissoes);
    }
}

public sealed record EnviarTesteCommand(Guid UsuarioId) : ICommand<EnvioTesteDto>;

internal sealed class EnviarTesteHandler(INotificacoesRepository repositorio, Notificador notificador) : ICommandHandler<EnviarTesteCommand, EnvioTesteDto>
{
    public async Task<Result<EnvioTesteDto>> Handle(EnviarTesteCommand command, CancellationToken cancellationToken)
    {
        var dispositivos = await repositorio.ListarDispositivosAsync(command.UsuarioId, cancellationToken);
        if (dispositivos.Count == 0) return NotificacoesErros.SemDispositivos;

        var entregues = await notificador.EnviarAsync(dispositivos, "AgentDesk: alerta de teste",
            "Deu certo! É assim que você vai ser avisado quando uma tarefa terminar.", "teste", cancellationToken);
        return entregues > 0 ? new EnvioTesteDto(entregues) : NotificacoesErros.NaoEntregue;
    }
}
