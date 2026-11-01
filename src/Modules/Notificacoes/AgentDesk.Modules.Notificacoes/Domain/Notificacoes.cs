using System.Security.Cryptography;
using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Notificacoes.Domain;

/// <summary>Um aparelho (navegador ou app instalado) que aceitou receber alertas. O endpoint é o endereço do serviço de push dele.</summary>
internal sealed record Dispositivo(Guid DispositivoId, Guid UsuarioId, string Endpoint, string P256dh, string Auth, string Nome, DateTimeOffset CriadoEm);

/// <summary>Quais tipos de alerta o usuário quer receber. Tudo ligado até ele desligar.</summary>
internal sealed record PreferenciasAlerta(bool Automacoes, bool Sessoes, bool Permissoes)
{
    public static readonly PreferenciasAlerta Padrao = new(true, true, true);

    public bool Aceita(TipoAlerta tipo) => tipo switch
    {
        TipoAlerta.Automacao => Automacoes,
        TipoAlerta.Sessao => Sessoes,
        _ => Permissoes,
    };
}

/// <summary>Par de chaves VAPID (P-256) que identifica este servidor perante os serviços de push; ambas em base64 "url-safe".</summary>
internal sealed record ChavesVapid(string Publica, string Privada)
{
    public static ChavesVapid Gerar()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var p = ecdsa.ExportParameters(true);
        var publica = new byte[65];
        publica[0] = 0x04; // ponto não comprimido
        p.Q.X!.CopyTo(publica, 1);
        p.Q.Y!.CopyTo(publica, 33);
        return new ChavesVapid(Base64Url(publica), Base64Url(p.D!));
    }

    public static string Base64Url(byte[] dados) => Convert.ToBase64String(dados).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

internal enum ResultadoEnvio
{
    Entregue,

    /// <summary>O serviço de push disse que o aparelho não existe mais (404/410): a inscrição deve ser apagada.</summary>
    DispositivoInvalido,

    Falhou,
}

internal interface INotificacoesRepository
{
    Task<IReadOnlyList<Dispositivo>> ListarDispositivosAsync(Guid usuarioId, CancellationToken cancellationToken);

    /// <summary>Cria ou atualiza (mesmo endpoint = mesmo aparelho; se era de outro usuário, passa para quem acabou de aceitar).</summary>
    Task<Dispositivo> SalvarDispositivoAsync(Dispositivo dispositivo, CancellationToken cancellationToken);

    Task<bool> RemoverDispositivoAsync(Guid usuarioId, string endpoint, CancellationToken cancellationToken);
    Task RemoverDispositivoPorIdAsync(Guid dispositivoId, CancellationToken cancellationToken);

    Task<PreferenciasAlerta> ObterPreferenciasAsync(Guid usuarioId, CancellationToken cancellationToken);
    Task SalvarPreferenciasAsync(Guid usuarioId, PreferenciasAlerta preferencias, CancellationToken cancellationToken);

    /// <summary>Chaves VAPID do servidor: as já gravadas ou, na primeira vez, as recém-geradas (duas chamadas ao mesmo tempo devolvem o mesmo par).</summary>
    Task<ChavesVapid> ObterOuCriarChavesAsync(Func<ChavesVapid> gerar, CancellationToken cancellationToken);
}

/// <summary>Fala com o serviço de push do aparelho (Google, Mozilla, Apple...). Nos testes é trocado por um falso.</summary>
internal interface IEnviadorPush
{
    Task<ResultadoEnvio> EnviarAsync(Dispositivo dispositivo, ChavesVapid chaves, string assunto, string conteudoJson, CancellationToken cancellationToken);
}
