using FluentValidation;
using AgentDesk.Modules.Sessoes.Application.Ingestao;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Sessoes.Application.Limites;

/// <summary>Uma janela como a statusline informa: percentual de 0 a 100 e o instante em que renova.</summary>
public sealed record JanelaRequestDto(decimal? Percentual, DateTimeOffset? RenovaEm);

/// <summary>Corpo de <c>POST /limites</c>: o que o coletor leu em <c>rate_limits</c> (só vêm as janelas que existem no plano).</summary>
public sealed record LimitesRequestDto(JanelaRequestDto? CincoHoras, JanelaRequestDto? Semana);

public sealed record JanelaDto(decimal Percentual, DateTimeOffset RenovaEm);

/// <summary>Janelas que ainda valem; uma que já renovou some (a barra volta quando o Claude Code informar de novo).</summary>
public sealed record LimitesDto(JanelaDto? CincoHoras, JanelaDto? Semana, DateTimeOffset? AtualizadoEm);

public sealed record InformarLimitesCommand(string? Token, LimitesRequestDto Corpo) : ICommand<bool>;

internal sealed class InformarLimitesValidator : AbstractValidator<InformarLimitesCommand>
{
    public InformarLimitesValidator()
    {
        RuleFor(x => x.Corpo).Must(c => c.CincoHoras is not null || c.Semana is not null)
            .OverridePropertyName("corpo").WithMessage("Informe ao menos uma janela (cincoHoras ou semana).");
        RuleFor(x => x.Corpo.CincoHoras).SetValidator(new JanelaValidator()!).When(x => x.Corpo.CincoHoras is not null).OverridePropertyName("cincoHoras");
        RuleFor(x => x.Corpo.Semana).SetValidator(new JanelaValidator()!).When(x => x.Corpo.Semana is not null).OverridePropertyName("semana");
    }
}

internal sealed class JanelaValidator : AbstractValidator<JanelaRequestDto>
{
    public JanelaValidator()
    {
        RuleFor(x => x.Percentual).NotNull().InclusiveBetween(0m, 100m).WithMessage("O percentual vai de 0 a 100.");
        RuleFor(x => x.RenovaEm).NotNull().WithMessage("Informe quando a janela renova.");
    }
}

internal sealed class InformarLimitesHandler(ITokensRepository tokens, ILimitesRepository limites, TimeProvider clock)
    : ICommandHandler<InformarLimitesCommand, bool>
{
    /// <summary>Renovação mais longe que isso não é uma janela de 5 horas nem de uma semana: dado estranho, descartado.</summary>
    private static readonly TimeSpan RenovacaoMaxima = TimeSpan.FromDays(8);

    public async Task<Result<bool>> Handle(InformarLimitesCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;

        var janelas = new List<LimiteJanela>();
        Adicionar(janelas, Janelas.CincoHoras, command.Corpo.CincoHoras, agora);
        Adicionar(janelas, Janelas.Semana, command.Corpo.Semana, agora);
        if (janelas.Count > 0) await limites.SalvarAsync(usuarioId.Value, janelas, cancellationToken);
        return true;
    }

    private static void Adicionar(List<LimiteJanela> lista, string janela, JanelaRequestDto? dto, DateTimeOffset agora)
    {
        if (dto is not { Percentual: { } p, RenovaEm: { } renova }) return;
        if (renova <= agora || renova > agora + RenovacaoMaxima) return; // já renovou (leitura velha) ou fora do possível
        lista.Add(new LimiteJanela(janela, Math.Round(p, 2), renova.ToUniversalTime(), agora));
    }
}

public sealed record ObterLimitesQuery(Guid UsuarioId) : IQuery<LimitesDto>;

internal sealed class ObterLimitesHandler(ILimitesRepository limites, TimeProvider clock) : IQueryHandler<ObterLimitesQuery, LimitesDto>
{
    public async Task<Result<LimitesDto>> Handle(ObterLimitesQuery query, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var vigentes = (await limites.ListarAsync(query.UsuarioId, cancellationToken)).Where(j => j.RenovaEm > agora).ToList();
        JanelaDto? De(string nome) => vigentes.FirstOrDefault(j => j.Janela == nome) is { } j ? new JanelaDto(j.Percentual, j.RenovaEm) : null;
        return new LimitesDto(De(Janelas.CincoHoras), De(Janelas.Semana), vigentes.Count == 0 ? null : vigentes.Max(j => j.AtualizadoEm));
    }
}
