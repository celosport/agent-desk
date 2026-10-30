using FluentValidation;
using AgentDesk.Modules.Contas.Domain;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using Microsoft.AspNetCore.Identity;

namespace AgentDesk.Modules.Contas.Application.Auth;

public sealed record SessaoDto(string AccessToken, string TokenType, DateTimeOffset ExpiraEm, UsuarioDto Usuario);
public sealed record UsuarioDto(Guid UsuarioId, string Nome, string Email, PerfilUsuario Perfil);
public sealed record CadastroRequestDto(string? Nome, string? Email, string? Senha);
public sealed record LoginRequestDto(string? Email, string? Senha);

/// <summary>Hash de senha com o PasswordHasher do ASP.NET (PBKDF2 com sal e iterações — nunca MD5/SHA simples).</summary>
internal static class Senhas
{
    private static readonly PasswordHasher<object> Hasher = new();
    public static string Hash(string senha) => Hasher.HashPassword(new object(), senha);
    public static bool Confere(string hash, string senha) =>
        Hasher.VerifyHashedPassword(new object(), hash, senha) != PasswordVerificationResult.Failed;
}

// ---- Cadastro ----

public sealed record CadastrarCommand(string? Nome, string? Email, string? Senha) : ICommand<SessaoDto>;

internal sealed class CadastrarValidator : AbstractValidator<CadastrarCommand>
{
    public CadastrarValidator()
    {
        RuleFor(x => x.Nome).NotEmpty().WithMessage("Informe o nome.").MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().WithMessage("Informe o e-mail.").EmailAddress().WithMessage("E-mail inválido.").MaximumLength(150);
        RuleFor(x => x.Senha).NotEmpty().WithMessage("Informe a senha.")
            .MinimumLength(8).WithMessage("A senha tem no mínimo 8 caracteres.").MaximumLength(100);
    }
}

internal sealed class CadastrarHandler(IUsuariosRepository usuarios, IGeradorToken tokens) : ICommandHandler<CadastrarCommand, SessaoDto>
{
    public async Task<Result<SessaoDto>> Handle(CadastrarCommand command, CancellationToken cancellationToken)
    {
        var usuario = new Usuario(Guid.NewGuid(), command.Nome!.Trim(), command.Email!.Trim().ToLowerInvariant(),
            Senhas.Hash(command.Senha!), PerfilUsuario.Usuario);
        if (!await usuarios.InserirAsync(usuario, cancellationToken)) return ContaErros.EmailEmUso;
        return Sessao.De(usuario, tokens);
    }
}

// ---- Login ----

public sealed record LoginCommand(string? Email, string? Senha) : ICommand<SessaoDto>;

internal sealed class LoginValidator : AbstractValidator<LoginCommand>
{
    public LoginValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("Informe o e-mail.");
        RuleFor(x => x.Senha).NotEmpty().WithMessage("Informe a senha.");
    }
}

internal sealed class LoginHandler(IUsuariosRepository usuarios, IGeradorToken tokens) : ICommandHandler<LoginCommand, SessaoDto>
{
    public async Task<Result<SessaoDto>> Handle(LoginCommand command, CancellationToken cancellationToken)
    {
        var usuario = await usuarios.ObterPorEmailAsync(command.Email!.Trim(), cancellationToken);
        if (usuario?.SenhaHash is null || !Senhas.Confere(usuario.SenhaHash, command.Senha!)) return ContaErros.CredenciaisInvalidas;
        return Sessao.De(usuario, tokens);
    }
}

internal static class Sessao
{
    public static SessaoDto De(Usuario u, IGeradorToken tokens)
    {
        var token = tokens.Gerar(u.UsuarioId, u.Nome, u.Email, u.Perfil);
        return new SessaoDto(token.AccessToken, "Bearer", token.ExpiraEm, new UsuarioDto(u.UsuarioId, u.Nome, u.Email, u.Perfil));
    }
}
