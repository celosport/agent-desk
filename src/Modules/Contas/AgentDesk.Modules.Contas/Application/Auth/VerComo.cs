using AgentDesk.Modules.Contas.Domain;
using AgentDesk.SharedKernel.Identidade;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Contas.Application.Auth;

public sealed record VerComoRequestDto(Guid UsuarioId);

/// <summary>
/// O ADMIN abre o app como um usuário, em SOMENTE LEITURA (o bloqueio de escrita está no middleware, pelo claim do token).
/// Vale só para contas USUARIO, o token dura 60 min e cada uso fica em <c>auditoria_ver_como</c>.
/// [[ADR-020 - Ver Como (Admin em Somente Leitura)]]
/// </summary>
public sealed record IniciarVerComoCommand(Guid AdminId, Guid UsuarioId) : ICommand<SessaoDto>;

internal sealed class IniciarVerComoHandler(IUsuariosRepository usuarios, IGeradorToken tokens, TimeProvider clock)
    : ICommandHandler<IniciarVerComoCommand, SessaoDto>
{
    public const int MinutosDeVida = 60;

    public async Task<Result<SessaoDto>> Handle(IniciarVerComoCommand command, CancellationToken cancellationToken)
    {
        var alvo = await usuarios.ObterPorIdAsync(command.UsuarioId, cancellationToken);
        if (alvo is null) return ContaErros.UsuarioNaoEncontrado;
        if (alvo.Perfil != PerfilUsuario.Usuario) return ContaErros.VerComoSoUsuario;
        var admin = await usuarios.ObterPorIdAsync(command.AdminId, cancellationToken);
        if (admin is null) return ContaErros.UsuarioNaoEncontrado;

        await usuarios.RegistrarVerComoAsync(admin.UsuarioId, alvo.UsuarioId, clock.GetUtcNow(), cancellationToken);
        var token = tokens.GerarVerComo(alvo.UsuarioId, alvo.Nome, alvo.Email, alvo.Perfil, admin.UsuarioId, MinutosDeVida);
        return new SessaoDto(token.AccessToken, "Bearer", token.ExpiraEm, UsuarioDto.De(alvo), admin.Nome);
    }
}
