using FluentValidation;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Sessoes.Application.Tokens;

// Tokens de ingestão do usuário do token (JWT). O segredo só aparece na resposta da criação.

public sealed record TokenIngestaoDto(Guid TokenId, string Nome, string Prefixo, DateTimeOffset CriadoEm, DateTimeOffset? UltimoUsoEm,
    DateTimeOffset? RevogadoEm)
{
    internal static TokenIngestaoDto De(TokenIngestao t) => new(t.TokenId, t.Nome, t.Prefixo, t.CriadoEm, t.UltimoUsoEm, t.RevogadoEm);
}

/// <param name="Segredo">O token completo — mostrado UMA vez; o servidor guarda só o hash.</param>
public sealed record TokenCriadoDto(TokenIngestaoDto Token, string Segredo);

public sealed record CriarTokenRequestDto(string? Nome);

// ---- Criar ----

public sealed record CriarTokenCommand(Guid UsuarioId, string? Nome) : ICommand<TokenCriadoDto>;

internal sealed class CriarTokenValidator : AbstractValidator<CriarTokenCommand>
{
    public CriarTokenValidator()
    {
        RuleFor(x => x.Nome).NotEmpty().WithMessage("Dê um nome para reconhecer a máquina (ex.: Notebook do trabalho).").MaximumLength(80);
    }
}

internal sealed class CriarTokenHandler(ITokensRepository tokens, TimeProvider clock) : ICommandHandler<CriarTokenCommand, TokenCriadoDto>
{
    public const int MaximoAtivos = 10;

    public async Task<Result<TokenCriadoDto>> Handle(CriarTokenCommand command, CancellationToken cancellationToken)
    {
        if (await tokens.ContarAtivosAsync(command.UsuarioId, cancellationToken) >= MaximoAtivos) return SessaoErros.LimiteDeTokens;

        var segredo = TokenIngestao.GerarSegredo();
        var token = new TokenIngestao(Guid.NewGuid(), command.UsuarioId, command.Nome!.Trim(), TokenIngestao.PrefixoDe(segredo),
            TokenIngestao.Hash(segredo), clock.GetUtcNow(), null, null);
        await tokens.InserirAsync(token, cancellationToken);
        return new TokenCriadoDto(TokenIngestaoDto.De(token), segredo);
    }
}

// ---- Listar ----

public sealed record ListarTokensQuery(Guid UsuarioId) : IQuery<IReadOnlyList<TokenIngestaoDto>>;

internal sealed class ListarTokensHandler(ITokensRepository tokens) : IQueryHandler<ListarTokensQuery, IReadOnlyList<TokenIngestaoDto>>
{
    public async Task<Result<IReadOnlyList<TokenIngestaoDto>>> Handle(ListarTokensQuery query, CancellationToken cancellationToken)
    {
        var lista = await tokens.ListarAsync(query.UsuarioId, cancellationToken);
        return Result.Success<IReadOnlyList<TokenIngestaoDto>>(lista.Select(TokenIngestaoDto.De).ToList());
    }
}

// ---- Revogar ----

public sealed record RevogarTokenCommand(Guid UsuarioId, Guid TokenId) : ICommand<bool>;

internal sealed class RevogarTokenHandler(ITokensRepository tokens, TimeProvider clock) : ICommandHandler<RevogarTokenCommand, bool>
{
    public async Task<Result<bool>> Handle(RevogarTokenCommand command, CancellationToken cancellationToken)
    {
        // De outro usuário ou já revogado = "não encontrado" (não revela que existe)
        if (!await tokens.RevogarAsync(command.UsuarioId, command.TokenId, clock.GetUtcNow(), cancellationToken))
            return SessaoErros.TokenNaoEncontrado;
        return true;
    }
}
