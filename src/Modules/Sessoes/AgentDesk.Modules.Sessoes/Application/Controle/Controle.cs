using FluentValidation;
using AgentDesk.Modules.Sessoes.Application.Ingestao;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Sessoes.Application.Controle;

// Controle das sessões pelo app: Parar e Aprovar/Negar. O app (JWT) decide; o hook do coletor (token de ingestão) pergunta.
// Nada é aprovado sozinho: sem decisão no prazo, o Claude Code volta a perguntar no terminal. [[ADR-015 - Parar e Aprovar-Negar Sessões do Claude Code]]

// ---- lado do app (usuário logado) ----

/// <summary>Pede para parar a sessão: o próximo hook de ferramenta interrompe o Claude Code.</summary>
public sealed record PararSessaoCommand(Guid UsuarioId, string SessaoId) : ICommand<bool>;

internal sealed class PararSessaoHandler(IControleRepository controle, TimeProvider clock) : ICommandHandler<PararSessaoCommand, bool>
{
    public async Task<Result<bool>> Handle(PararSessaoCommand command, CancellationToken cancellationToken)
    {
        if (!await controle.SessaoExisteAsync(command.UsuarioId, command.SessaoId, cancellationToken)) return SessaoErros.SessaoNaoEncontrada;
        await controle.SolicitarParadaAsync(command.UsuarioId, command.SessaoId, clock.GetUtcNow(), cancellationToken);
        return true;
    }
}

/// <param name="Decisao">"APROVAR" ou "NEGAR".</param>
public sealed record DecidirPermissaoCommand(Guid UsuarioId, Guid PermissaoId, string? Decisao) : ICommand<bool>;

internal sealed class DecidirPermissaoValidator : AbstractValidator<DecidirPermissaoCommand>
{
    public DecidirPermissaoValidator()
    {
        RuleFor(x => x.Decisao).Must(d => d is RegrasControle.Aprovar or RegrasControle.Negar)
            .WithMessage("Decisão inválida: use APROVAR ou NEGAR.").OverridePropertyName("decisao");
    }
}

internal sealed class DecidirPermissaoHandler(IControleRepository controle, TimeProvider clock) : ICommandHandler<DecidirPermissaoCommand, bool>
{
    public async Task<Result<bool>> Handle(DecidirPermissaoCommand command, CancellationToken cancellationToken)
        => await controle.DecidirAsync(command.UsuarioId, command.PermissaoId, command.Decisao!, clock.GetUtcNow(), cancellationToken) switch
        {
            ResultadoDecisao.Decidida => true,
            ResultadoDecisao.JaDecidida => ControleErros.JaDecidida,
            _ => ControleErros.PermissaoNaoEncontrada,
        };
}

internal static class ControleErros
{
    public static readonly Error PermissaoNaoEncontrada = Error.NotFound(
        "Sessoes.PermissaoNaoEncontrada", "Este pedido de permissão não existe mais (venceu ou já foi respondido no terminal).");

    public static readonly Error JaDecidida = Error.Conflict("Sessoes.PermissaoJaDecidida", "Este pedido já foi respondido.");

    public static readonly Error PendentesDemais = Error.Conflict(
        "Sessoes.PermissoesPendentesDemais", "Há pedidos de permissão demais esperando resposta.");
}

// ---- lado do coletor (token de ingestão) ----

/// <summary>O hook de ferramenta pergunta: há pedido de parada para esta sessão? (consome o pedido)</summary>
public sealed record ConsultarParadaCommand(string? Token, string? SessaoId) : ICommand<bool>;

internal sealed class ConsultarParadaHandler(ITokensRepository tokens, IControleRepository controle, TimeProvider clock)
    : ICommandHandler<ConsultarParadaCommand, bool>
{
    public async Task<Result<bool>> Handle(ConsultarParadaCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;
        if (string.IsNullOrWhiteSpace(command.SessaoId) || command.SessaoId.Length > 100) return false;
        return await controle.ConsumirParadaAsync(usuarioId.Value, command.SessaoId, agora, cancellationToken);
    }
}

public sealed record PermissaoRequestDto(string? SessaoId, string? Ferramenta, string? Resumo);

public sealed record PermissaoCriadaDto(Guid PermissaoId, DateTimeOffset ExpiraEm);

public sealed record SolicitarPermissaoCommand(string? Token, PermissaoRequestDto Corpo) : ICommand<PermissaoCriadaDto>;

internal sealed class SolicitarPermissaoValidator : AbstractValidator<SolicitarPermissaoCommand>
{
    public SolicitarPermissaoValidator()
    {
        RuleFor(x => x.Corpo.SessaoId).NotEmpty().MaximumLength(100).OverridePropertyName("sessaoId");
        RuleFor(x => x.Corpo.Ferramenta).NotEmpty().MaximumLength(80).OverridePropertyName("ferramenta");
        RuleFor(x => x.Corpo.Resumo).MaximumLength(120).OverridePropertyName("resumo");
    }
}

internal sealed class SolicitarPermissaoHandler(ITokensRepository tokens, IControleRepository controle, TimeProvider clock)
    : ICommandHandler<SolicitarPermissaoCommand, PermissaoCriadaDto>
{
    public async Task<Result<PermissaoCriadaDto>> Handle(SolicitarPermissaoCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;
        if (await controle.ContarPermissoesPendentesAsync(usuarioId.Value, agora, cancellationToken) >= RegrasControle.MaximoPendentesPorUsuario)
            return ControleErros.PendentesDemais;

        var c = command.Corpo;
        var permissao = new PermissaoPendente(Guid.NewGuid(), usuarioId.Value, c.SessaoId!.Trim(), c.Ferramenta!.Trim(),
            string.IsNullOrWhiteSpace(c.Resumo) ? null : c.Resumo.Trim(), agora, agora + RegrasControle.ValidadePermissao);
        await controle.CriarPermissaoAsync(permissao, cancellationToken);
        return new PermissaoCriadaDto(permissao.PermissaoId, permissao.ExpiraEm);
    }
}

/// <param name="Decisao">"APROVAR", "NEGAR" ou nulo (sem decisão até o fim da espera).</param>
public sealed record DecisaoDto(string? Decisao);

/// <summary>O hook espera (long polling, até 50 s) a decisão do app. Sem decisão = nulo: o Claude Code pergunta no terminal.</summary>
public sealed record AguardarPermissaoQuery(string? Token, Guid PermissaoId, int EsperaSegundos) : IQuery<DecisaoDto>;

internal sealed class AguardarPermissaoHandler(ITokensRepository tokens, IControleRepository controle, TimeProvider clock)
    : IQueryHandler<AguardarPermissaoQuery, DecisaoDto>
{
    private static readonly TimeSpan Intervalo = TimeSpan.FromMilliseconds(500);

    public async Task<Result<DecisaoDto>> Handle(AguardarPermissaoQuery query, CancellationToken cancellationToken)
    {
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, query.Token, clock.GetUtcNow(), cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;

        var espera = TimeSpan.FromSeconds(Math.Clamp(query.EsperaSegundos, 0, RegrasControle.EsperaMaximaSegundos));
        var limite = clock.GetTimestamp();
        try
        {
            while (true)
            {
                var (existe, decisao) = await controle.DecisaoAsync(usuarioId.Value, query.PermissaoId, cancellationToken);
                if (!existe) return ControleErros.PermissaoNaoEncontrada;
                if (decisao is not null) return new DecisaoDto(decisao);
                if (clock.GetElapsedTime(limite) >= espera) return new DecisaoDto(null);
                await Task.Delay(Intervalo, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            return new DecisaoDto(null); // o hook desistiu (timeout dele): sem decisão
        }
    }
}
