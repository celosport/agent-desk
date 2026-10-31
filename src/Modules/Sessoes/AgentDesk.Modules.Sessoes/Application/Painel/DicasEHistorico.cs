using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Tempo;

namespace AgentDesk.Modules.Sessoes.Application.Painel;

// Dicas, histórico de sessões (90 dias) e linha do tempo. "Quem pergunta" vem do token; o escopo TODOS só vale para o ADMIN (o controller confere).

public sealed record DicaDto(string Regra, string Titulo, string Texto, string? Projeto, string? SessaoId, decimal EconomiaUsd);

/// <param name="EconomiaTotalUsd">Soma das estimativas: um teto otimista, não uma promessa (as dicas se sobrepõem).</param>
public sealed record DicasDto(IReadOnlyList<DicaDto> Dicas, decimal EconomiaTotalUsd, int Dias);

/// <param name="Usuario">Só no escopo TODOS.</param>
public sealed record SessaoHistoricoDto(
    string SessaoId,
    Guid UsuarioId,
    string? UsuarioNome,
    string Maquina,
    string Projeto,
    string ProjetoChave,
    string? Modelo,
    StatusSessao Status,
    UsoClaudeCodeDto Uso,
    DateTimeOffset IniciadaEm,
    DateTimeOffset UltimaAtividadeEm,
    DateTimeOffset? EncerradaEm,
    /// <summary>Da primeira à última atividade (ou ao encerramento).</summary>
    long DuracaoMs)
{
    internal static SessaoHistoricoDto De(SessaoHistorico s, string? usuarioNome) => new(s.SessaoId, s.UsuarioId, usuarioNome, s.Maquina, s.Projeto,
        s.ProjetoChave, s.Modelo, s.Status, UsoClaudeCodeDto.De(s.Uso), s.IniciadaEm, s.UltimaAtividadeEm, s.EncerradaEm,
        (long)Math.Max(0, ((s.EncerradaEm ?? s.UltimaAtividadeEm) - s.IniciadaEm).TotalMilliseconds));
}

public sealed record ProjetoOpcaoDto(string Chave, string Nome);

public sealed record PaginaHistoricoSessoesDto(
    IReadOnlyList<SessaoHistoricoDto> Itens, int Total, int Pagina, int Tamanho, IReadOnlyList<ProjetoOpcaoDto> Projetos);

/// <param name="Tokens">Só nos itens de chamada ao modelo (<c>api_request</c>).</param>
public sealed record EventoLinhaDto(DateTimeOffset OcorridoEm, string Tipo, string? Ferramenta, string? Resumo, string? Modelo, long? Tokens, decimal? CustoUsd);

public sealed record LinhaDoTempoDto(SessaoHistoricoDto Sessao, IReadOnlyList<EventoLinhaDto> Eventos, bool Cortada);

/// <param name="UsuarioId">Null = todos (escopo TODOS).</param>
public sealed record ObterDicasQuery(Guid? UsuarioId) : IQuery<DicasDto>;

internal sealed class ObterDicasHandler(ISessoesConsultas consultas, TimeProvider clock) : IQueryHandler<ObterDicasQuery, DicasDto>
{
    public async Task<Result<DicasDto>> Handle(ObterDicasQuery query, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var primeiroDia = RegrasDicas.PrimeiroDia(agora);
        var hoje = FusoBrasil.DataLocal(agora);
        var sessoes = await consultas.ResumosAsync(query.UsuarioId, FusoBrasil.InicioDoDia(primeiroDia), cancellationToken);
        var dias = await consultas.PorDiaAsync(query.UsuarioId, primeiroDia, hoje, cancellationToken);

        var dicas = RegrasDicas.Calcular(sessoes, dias);
        return new DicasDto(dicas.Select(d => new DicaDto(d.Regra, d.Titulo, d.Texto, d.Projeto, d.SessaoId, d.EconomiaUsd)).ToList(),
            dicas.Sum(d => d.EconomiaUsd), RegrasDicas.Dias);
    }
}

/// <param name="De">Dia inicial de Brasília (incluso).</param>
/// <param name="Ate">Dia final de Brasília (incluso).</param>
public sealed record ListarHistoricoSessoesQuery(Guid? UsuarioId, string? ProjetoChave, DateOnly? De, DateOnly? Ate, int Pagina, int Tamanho)
    : IQuery<PaginaHistoricoSessoesDto>;

internal sealed class ListarHistoricoSessoesHandler(ISessoesConsultas consultas, IDiretorioUsuarios usuarios, TimeProvider clock)
    : IQueryHandler<ListarHistoricoSessoesQuery, PaginaHistoricoSessoesDto>
{
    public const int DiasDeHistorico = 90;
    public const int TamanhoPadrao = 20;
    public const int TamanhoMaximo = 100;

    public async Task<Result<PaginaHistoricoSessoesDto>> Handle(ListarHistoricoSessoesQuery q, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var hoje = FusoBrasil.DataLocal(agora);
        var limiteInferior = hoje.AddDays(-(DiasDeHistorico - 1));
        var de = q.De is { } d && d > limiteInferior ? d : limiteInferior;
        var ate = q.Ate is { } a && a < hoje ? a : hoje;
        var pagina = Math.Max(1, q.Pagina);
        var tamanho = q.Tamanho <= 0 ? TamanhoPadrao : Math.Min(q.Tamanho, TamanhoMaximo);
        var projeto = string.IsNullOrWhiteSpace(q.ProjetoChave) ? null : q.ProjetoChave.Trim();

        var (itens, total) = await consultas.HistoricoAsync(
            new FiltroHistoricoSessoes(q.UsuarioId, projeto, FusoBrasil.InicioDoDia(de), FusoBrasil.InicioDoDia(ate.AddDays(1)), pagina, tamanho),
            cancellationToken);
        var projetos = await consultas.ProjetosAsync(q.UsuarioId, FusoBrasil.InicioDoDia(limiteInferior), cancellationToken);

        var nomes = q.UsuarioId is null
            ? await usuarios.NomesAsync(itens.Select(i => i.UsuarioId).Distinct().ToList(), cancellationToken)
            : new Dictionary<Guid, string>();
        return new PaginaHistoricoSessoesDto(
            itens.Select(i => SessaoHistoricoDto.De(i, nomes.GetValueOrDefault(i.UsuarioId))).ToList(), total, pagina, tamanho,
            projetos.Select(p => new ProjetoOpcaoDto(p.Chave, p.Nome)).ToList());
    }
}

/// <param name="UsuarioId">O dono (ou nulo para o ADMIN abrir a sessão de qualquer usuário).</param>
public sealed record ObterLinhaDoTempoQuery(Guid? UsuarioId, string SessaoId) : IQuery<LinhaDoTempoDto>;

internal sealed class ObterLinhaDoTempoHandler(ISessoesConsultas consultas, IDiretorioUsuarios usuarios) : IQueryHandler<ObterLinhaDoTempoQuery, LinhaDoTempoDto>
{
    public const int LimiteDeEventos = 1000;

    public async Task<Result<LinhaDoTempoDto>> Handle(ObterLinhaDoTempoQuery query, CancellationToken cancellationToken)
    {
        // Pede um a mais para saber se cortou
        var achada = await consultas.LinhaDoTempoAsync(query.UsuarioId, query.SessaoId, LimiteDeEventos + 1, cancellationToken);
        if (achada is not { } r) return SessaoErros.NaoEncontrada;

        string? nome = null;
        if (query.UsuarioId is null)
            nome = (await usuarios.NomesAsync([r.Sessao.UsuarioId], cancellationToken)).GetValueOrDefault(r.Sessao.UsuarioId);
        var cortada = r.Eventos.Count > LimiteDeEventos;
        return new LinhaDoTempoDto(SessaoHistoricoDto.De(r.Sessao, nome),
            r.Eventos.Take(LimiteDeEventos).Select(e => new EventoLinhaDto(e.OcorridoEm, e.Tipo, e.Ferramenta, e.Resumo, e.Modelo, e.Tokens, e.CustoUsd)).ToList(),
            cortada);
    }
}

internal static class SessaoErros
{
    public static readonly Error NaoEncontrada = Error.NotFound("Sessoes.NaoEncontrada", "Sessão não encontrada.");
}
