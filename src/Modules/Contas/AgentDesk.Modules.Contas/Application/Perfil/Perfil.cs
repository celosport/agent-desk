using FluentValidation;
using AgentDesk.Modules.Contas.Application.Auth;
using AgentDesk.Modules.Contas.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Web;

namespace AgentDesk.Modules.Contas.Application.Perfil;

public sealed record FotoDto(byte[] Bytes, string Tipo);
public sealed record AtualizarNomeRequestDto(string? Nome);

// ---- Quem sou eu (perfil completo: nome e foto) ----

public sealed record ObterPerfilQuery(Guid UsuarioId) : IQuery<UsuarioDto>;

internal sealed class ObterPerfilHandler(IUsuariosRepository usuarios) : IQueryHandler<ObterPerfilQuery, UsuarioDto>
{
    public async Task<Result<UsuarioDto>> Handle(ObterPerfilQuery query, CancellationToken cancellationToken)
    {
        var usuario = await usuarios.ObterPorIdAsync(query.UsuarioId, cancellationToken);
        return usuario is null ? ContaErros.UsuarioNaoEncontrado : UsuarioDto.De(usuario);
    }
}

// ---- Alterar o nome ----

public sealed record AtualizarNomeCommand(Guid UsuarioId, string? Nome) : ICommand<UsuarioDto>;

internal sealed class AtualizarNomeValidator : AbstractValidator<AtualizarNomeCommand>
{
    public AtualizarNomeValidator()
    {
        RuleFor(x => x.Nome).NotEmpty().WithMessage("Informe o nome.").MaximumLength(150).WithMessage("O nome tem no máximo 150 caracteres.");
    }
}

internal sealed class AtualizarNomeHandler(IUsuariosRepository usuarios) : ICommandHandler<AtualizarNomeCommand, UsuarioDto>
{
    public async Task<Result<UsuarioDto>> Handle(AtualizarNomeCommand command, CancellationToken cancellationToken)
    {
        await usuarios.AtualizarNomeAsync(command.UsuarioId, command.Nome!.Trim(), cancellationToken);
        var usuario = await usuarios.ObterPorIdAsync(command.UsuarioId, cancellationToken);
        return usuario is null ? ContaErros.UsuarioNaoEncontrado : UsuarioDto.De(usuario);
    }
}

// ---- Foto de perfil ----

public sealed record EnviarFotoCommand(Guid UsuarioId, byte[] Bytes) : ICommand<UsuarioDto>;

internal sealed class EnviarFotoHandler(IUsuariosRepository usuarios) : ICommandHandler<EnviarFotoCommand, UsuarioDto>
{
    public async Task<Result<UsuarioDto>> Handle(EnviarFotoCommand command, CancellationToken cancellationToken)
    {
        if (command.Bytes.Length > FormatoImagem.TamanhoMaximoBytes) return ContaErros.FotoGrande;
        var tipo = FormatoImagem.Detectar(command.Bytes);
        if (tipo is null) return ContaErros.FotoInvalida;

        await usuarios.SalvarFotoAsync(command.UsuarioId, new Foto(command.Bytes, tipo), Guid.NewGuid().ToString("N")[..16], cancellationToken);
        var usuario = await usuarios.ObterPorIdAsync(command.UsuarioId, cancellationToken);
        return usuario is null ? ContaErros.UsuarioNaoEncontrado : UsuarioDto.De(usuario);
    }
}

public sealed record RemoverFotoCommand(Guid UsuarioId) : ICommand<UsuarioDto>;

internal sealed class RemoverFotoHandler(IUsuariosRepository usuarios) : ICommandHandler<RemoverFotoCommand, UsuarioDto>
{
    public async Task<Result<UsuarioDto>> Handle(RemoverFotoCommand command, CancellationToken cancellationToken)
    {
        await usuarios.RemoverFotoAsync(command.UsuarioId, cancellationToken);
        var usuario = await usuarios.ObterPorIdAsync(command.UsuarioId, cancellationToken);
        return usuario is null ? ContaErros.UsuarioNaoEncontrado : UsuarioDto.De(usuario);
    }
}

// ---- Servir a foto (por URL: o id é um GUID e o ?v= versiona o cache) ----

public sealed record ObterFotoQuery(Guid UsuarioId) : IQuery<FotoDto>;

internal sealed class ObterFotoHandler(IUsuariosRepository usuarios) : IQueryHandler<ObterFotoQuery, FotoDto>
{
    public async Task<Result<FotoDto>> Handle(ObterFotoQuery query, CancellationToken cancellationToken)
    {
        var foto = await usuarios.ObterFotoAsync(query.UsuarioId, cancellationToken);
        return foto is null ? ContaErros.FotoNaoEncontrada : new FotoDto(foto.Bytes, foto.Tipo);
    }
}
