using AgentDesk.Modules.Consumo.Application.DTOs;
using AgentDesk.Modules.Consumo.Domain;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Tempo;

namespace AgentDesk.Modules.Consumo.Application.Consumo;

// Leituras do painel e do histórico. "Quem pergunta" vem do token; o escopo TODOS só vale para o ADMIN (o controller confere).
// Dia e mês contam no fuso de Brasília, com o "agora" do TimeProvider.

/// <param name="UsuarioId">Null = todos (escopo TODOS).</param>
public sealed record ObterResumoQuery(Guid? UsuarioId, int Dias) : IQuery<ResumoConsumoDto>;

internal sealed class ObterResumoHandler(IConsumoConsultas consultas, IConfiguracoesDeUso configuracoes, TimeProvider clock)
    : IQueryHandler<ObterResumoQuery, ResumoConsumoDto>
{
    public const int DiasPadrao = 30;

    public async Task<Result<ResumoConsumoDto>> Handle(ObterResumoQuery query, CancellationToken cancellationToken)
    {
        var dias = Math.Clamp(query.Dias, 7, 90);
        var agora = clock.GetUtcNow();
        var (inicioHoje, fimHoje) = FusoBrasil.Dia(agora);
        var (inicioMes, _) = FusoBrasil.Mes(agora);
        var primeiroDia = FusoBrasil.DataLocal(agora).AddDays(-(dias - 1));
        var inicioJanela = FusoBrasil.InicioDoDia(primeiroDia);

        var hoje = await consultas.TotaisAsync(query.UsuarioId, inicioHoje, fimHoje, cancellationToken);
        var mes = await consultas.TotaisAsync(query.UsuarioId, inicioMes, fimHoje, cancellationToken);
        var acumulado = await consultas.TotaisAsync(query.UsuarioId, null, fimHoje, cancellationToken);
        var porDia = (await consultas.PorDiaAsync(query.UsuarioId, inicioJanela, fimHoje, cancellationToken)).ToDictionary(d => d.Dia);
        var ranking = await consultas.RankingAsync(query.UsuarioId, inicioJanela, fimHoje, cancellationToken);

        // Todos os dias da janela, inclusive os sem chamada (o gráfico não pula dias)
        var serie = Enumerable.Range(0, dias).Select(i => primeiroDia.AddDays(i))
            .Select(d => porDia.TryGetValue(d, out var t)
                ? new ConsumoDiaDto(d, t.Chamadas, t.Tokens, t.CustoUsd)
                : new ConsumoDiaDto(d, 0, 0, 0m))
            .ToList();

        decimal? limite = null, percentual = null;
        if (query.UsuarioId is { } usuarioId)
        {
            limite = (await configuracoes.ObterPreferenciasAsync(usuarioId, cancellationToken)).LimiteMensalUsd;
            if (limite is { } l) percentual = Math.Round(mes.CustoUsd / l * 100m, 1);
        }

        return new ResumoConsumoDto(query.UsuarioId is null ? EscopoConsumo.Todos : EscopoConsumo.Meu,
            TotaisDto.De(hoje), TotaisDto.De(mes), TotaisDto.De(acumulado), dias, serie,
            ranking.Select(r => new RankingAutomacaoDto(r.AutomacaoId, r.Nome, r.Chamadas, r.Tokens, r.CustoUsd)).ToList(),
            limite, percentual, agora);
    }
}

/// <param name="De">Dia inicial de Brasília (incluso).</param>
/// <param name="Ate">Dia final de Brasília (incluso).</param>
public sealed record ListarChamadasQuery(
    Guid? UsuarioId,
    DateOnly? De,
    DateOnly? Ate,
    Guid? AutomacaoId,
    string? ModeloId,
    StatusChamada? Status,
    int Pagina,
    int Tamanho) : IQuery<PaginaChamadasDto>;

internal sealed class ListarChamadasHandler(IConsumoConsultas consultas, IDiretorioUsuarios usuarios)
    : IQueryHandler<ListarChamadasQuery, PaginaChamadasDto>
{
    public const int TamanhoPadrao = 20;
    public const int TamanhoMaximo = 100;

    public async Task<Result<PaginaChamadasDto>> Handle(ListarChamadasQuery q, CancellationToken cancellationToken)
    {
        if (q.De is { } de && q.Ate is { } ate && de > ate) return ConsumoErros.PeriodoInvalido();

        var pagina = Math.Max(1, q.Pagina);
        var tamanho = Math.Clamp(q.Tamanho <= 0 ? TamanhoPadrao : q.Tamanho, 1, TamanhoMaximo);
        var filtro = new FiltroHistorico(q.UsuarioId,
            q.De is { } d ? FusoBrasil.InicioDoDia(d) : null,
            q.Ate is { } a ? FusoBrasil.InicioDoDia(a.AddDays(1)) : null,
            q.AutomacaoId, string.IsNullOrWhiteSpace(q.ModeloId) ? null : q.ModeloId.Trim(), q.Status, pagina, tamanho);

        var (itens, total, totais) = await consultas.ListarAsync(filtro, cancellationToken);

        // Nome de quem fez só no escopo TODOS (o próprio usuário sabe que é ele)
        var nomes = q.UsuarioId is null
            ? await usuarios.NomesAsync(itens.Select(i => i.UsuarioId).ToList(), cancellationToken)
            : new Dictionary<Guid, string>();

        return new PaginaChamadasDto(itens.Select(i => ChamadaDto.De(i, nomes.GetValueOrDefault(i.UsuarioId))).ToList(),
            total, pagina, tamanho, TotaisDto.De(totais));
    }
}

/// <param name="UsuarioId">Null = ADMIN pode abrir a chamada de qualquer usuário.</param>
public sealed record ObterChamadaQuery(Guid ChamadaId, Guid? UsuarioId) : IQuery<ChamadaDetalheDto>;

internal sealed class ObterChamadaHandler(IConsumoConsultas consultas, IDiretorioUsuarios usuarios)
    : IQueryHandler<ObterChamadaQuery, ChamadaDetalheDto>
{
    public async Task<Result<ChamadaDetalheDto>> Handle(ObterChamadaQuery q, CancellationToken cancellationToken)
    {
        // Chamada de outro usuário = "não encontrada" (nunca revela que existe)
        var c = await consultas.ObterAsync(q.ChamadaId, q.UsuarioId, cancellationToken);
        if (c is null) return ConsumoErros.NaoEncontrada;

        var nome = q.UsuarioId is null ? (await usuarios.NomesAsync([c.UsuarioId], cancellationToken)).GetValueOrDefault(c.UsuarioId) : null;
        return new ChamadaDetalheDto(ChamadaDto.De(c, nome), c.Resultado,
            c.PrecoEntradaMTok, c.PrecoSaidaMTok, c.PrecoCacheLeituraMTok, c.PrecoCacheEscritaMTok);
    }
}

public sealed record ObterFiltrosQuery(Guid? UsuarioId) : IQuery<FiltrosConsumoDto>;

internal sealed class ObterFiltrosHandler(IConsumoConsultas consultas) : IQueryHandler<ObterFiltrosQuery, FiltrosConsumoDto>
{
    public async Task<Result<FiltrosConsumoDto>> Handle(ObterFiltrosQuery q, CancellationToken cancellationToken)
    {
        var (automacoes, modelos) = await consultas.FiltrosAsync(q.UsuarioId, cancellationToken);
        return new FiltrosConsumoDto(automacoes.Select(a => new AutomacaoFiltroDto(a.AutomacaoId, a.Nome)).ToList(), modelos);
    }
}
