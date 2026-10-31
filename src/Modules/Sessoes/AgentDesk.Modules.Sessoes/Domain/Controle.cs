namespace AgentDesk.Modules.Sessoes.Domain;

/// <summary>Um pedido de permissão do Claude Code esperando o Aprovar/Negar do app (só metadados: ferramenta e resumo curto).</summary>
internal sealed record PermissaoPendente(Guid PermissaoId, Guid UsuarioId, string SessaoId, string Ferramenta, string? Resumo,
    DateTimeOffset CriadaEm, DateTimeOffset ExpiraEm);

internal enum ResultadoDecisao
{
    Decidida,
    NaoEncontrada,
    JaDecidida,
}

/// <summary>Regras de tempo do controle remoto das sessões.</summary>
internal static class RegrasControle
{
    /// <summary>O pedido de parada vale para a próxima ferramenta; depois de 2 minutos sem ferramenta, some.</summary>
    public static readonly TimeSpan ValidadeParada = TimeSpan.FromMinutes(2);

    /// <summary>
    /// O hook do Claude Code espera até ~50 s pela decisão (timeout do hook: 60 s). Passou disso, o pedido some do app e o Claude
    /// Code volta a perguntar no terminal: nunca se aprova sozinho.
    /// </summary>
    public static readonly TimeSpan ValidadePermissao = TimeSpan.FromSeconds(55);

    public const int EsperaMaximaSegundos = 50;
    public const int MaximoPendentesPorUsuario = 20;

    public const string Aprovar = "APROVAR";
    public const string Negar = "NEGAR";
}

internal interface IControleRepository
{
    /// <summary>Pedido de parada (um por sessão; pedir de novo renova).</summary>
    Task SolicitarParadaAsync(Guid usuarioId, string sessaoId, DateTimeOffset agora, CancellationToken cancellationToken);

    /// <summary>True se havia pedido de parada vigente — e já o consome (vale uma vez só).</summary>
    Task<bool> ConsumirParadaAsync(Guid usuarioId, string sessaoId, DateTimeOffset agora, CancellationToken cancellationToken);

    Task<IReadOnlySet<string>> SessoesComParadaAsync(Guid usuarioId, DateTimeOffset agora, CancellationToken cancellationToken);

    Task<bool> SessaoExisteAsync(Guid usuarioId, string sessaoId, CancellationToken cancellationToken);

    Task<int> ContarPermissoesPendentesAsync(Guid usuarioId, DateTimeOffset agora, CancellationToken cancellationToken);
    Task CriarPermissaoAsync(PermissaoPendente permissao, CancellationToken cancellationToken);

    /// <summary>Pedidos sem decisão e ainda dentro do prazo.</summary>
    Task<IReadOnlyList<PermissaoPendente>> ListarPermissoesPendentesAsync(Guid usuarioId, DateTimeOffset agora, CancellationToken cancellationToken);

    /// <summary>"APROVAR"/"NEGAR", ou null se ainda não decidiu. <paramref name="existe"/> false = id de outro usuário ou inexistente.</summary>
    Task<(bool Existe, string? Decisao)> DecisaoAsync(Guid usuarioId, Guid permissaoId, CancellationToken cancellationToken);

    Task<ResultadoDecisao> DecidirAsync(Guid usuarioId, Guid permissaoId, string decisao, DateTimeOffset agora, CancellationToken cancellationToken);

    /// <summary>Apaga pedidos e paradas já vencidos antes de <paramref name="limite"/>.</summary>
    Task<int> LimparAsync(DateTimeOffset limite, CancellationToken cancellationToken);
}
