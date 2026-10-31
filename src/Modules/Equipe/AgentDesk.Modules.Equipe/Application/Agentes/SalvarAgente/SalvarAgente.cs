using System.Text.RegularExpressions;
using FluentValidation;
using AgentDesk.Modules.Equipe.Application.DTOs;
using AgentDesk.Modules.Equipe.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Equipe.Application.Agentes.SalvarAgente;

/// <summary>Cria ou atualiza a personalização de um agente (nome, cores, acessório, antena e expressão).</summary>
public sealed record SalvarAgenteCommand(
    Guid UsuarioId,
    string? Alvo,
    string? Chave,
    int? Ordem,
    string? Nome,
    string? CorCabeca,
    string? CorCorpo,
    string? CorDetalhe,
    string? CorOlhos,
    string? Acessorio,
    string? Antena,
    string? Expressao) : ICommand<AgenteDto>;

internal sealed partial class SalvarAgenteValidator : AbstractValidator<SalvarAgenteCommand>
{
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex Cor();

    private const string MensagemCor = "Cor inválida: use o formato #rrggbb.";

    public SalvarAgenteValidator()
    {
        RuleFor(x => x.Alvo).Must(a => a is not null && OpcoesAgente.Alvos.Contains(a.Trim().ToUpperInvariant()))
            .WithMessage("Alvo inválido: use AUTOMACAO ou PROJETO.");
        RuleFor(x => x.Chave).NotEmpty().WithMessage("Informe a chave do agente.").MaximumLength(80);
        RuleFor(x => x.Ordem).InclusiveBetween(0, OpcoesAgente.OrdemMaxima)
            .WithMessage($"A posição na equipe vai de 0 a {OpcoesAgente.OrdemMaxima}.");
        RuleFor(x => x.Ordem).Equal(0).When(x => string.Equals(x.Alvo?.Trim(), OpcoesAgente.Automacao, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Agente de automação não tem posição na equipe (use 0).");
        RuleFor(x => x.Nome).NotEmpty().WithMessage("Dê um nome ao agente.").MaximumLength(20).WithMessage("O nome tem no máximo 20 caracteres.");
        RuleFor(x => x.CorCabeca).Must(Valida).WithMessage(MensagemCor);
        RuleFor(x => x.CorCorpo).Must(Valida).WithMessage(MensagemCor);
        RuleFor(x => x.CorDetalhe).Must(Valida).WithMessage(MensagemCor);
        RuleFor(x => x.CorOlhos).Must(Valida).WithMessage(MensagemCor);
        RuleFor(x => x.Acessorio).Must(v => v is null || OpcoesAgente.Acessorios.Contains(v.Trim().ToUpperInvariant()))
            .WithMessage("Acessório inválido.");
        RuleFor(x => x.Antena).Must(v => v is null || OpcoesAgente.Antenas.Contains(v.Trim().ToUpperInvariant()))
            .WithMessage("Antena inválida.");
        RuleFor(x => x.Expressao).Must(v => v is null || OpcoesAgente.Expressoes.Contains(v.Trim().ToUpperInvariant()))
            .WithMessage("Expressão inválida.");
    }

    private static bool Valida(string? cor) => cor is not null && Cor().IsMatch(cor);
}

internal sealed class SalvarAgenteHandler(IEquipeRepository repository, TimeProvider clock) : ICommandHandler<SalvarAgenteCommand, AgenteDto>
{
    public async Task<Result<AgenteDto>> Handle(SalvarAgenteCommand c, CancellationToken cancellationToken)
    {
        var agente = new AgentePersonalizado(
            Guid.NewGuid(), c.UsuarioId, c.Alvo!.Trim().ToUpperInvariant(), c.Chave!.Trim(), c.Ordem!.Value, c.Nome!.Trim(),
            c.CorCabeca!.ToLowerInvariant(), c.CorCorpo!.ToLowerInvariant(), c.CorDetalhe!.ToLowerInvariant(), c.CorOlhos!.ToLowerInvariant(),
            (c.Acessorio ?? "NENHUM").Trim().ToUpperInvariant(), (c.Antena ?? "RETA").Trim().ToUpperInvariant(),
            (c.Expressao ?? "NORMAL").Trim().ToUpperInvariant(), clock.GetUtcNow());
        return AgenteDto.De(await repository.SalvarAsync(agente, cancellationToken));
    }
}
