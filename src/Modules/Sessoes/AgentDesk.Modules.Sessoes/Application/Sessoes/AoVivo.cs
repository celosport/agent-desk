using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Sessoes.Application.Sessoes;

public sealed record SessaoAoVivoDto(
    string SessaoId,
    string Maquina,
    StatusSessao Status,
    string? Atividade,
    string? Modelo,
    long Tokens,
    long TokensCacheLeitura,
    decimal CustoUsd,
    int Pedidos,
    DateTimeOffset IniciadaEm,
    DateTimeOffset UltimaAtividadeEm);

/// <summary>Uma "sala" do Escritório: as sessões abertas de um projeto (mesma pasta, mesmo hash do caminho).</summary>
public sealed record ProjetoAoVivoDto(string Chave, string Nome, IReadOnlyList<SessaoAoVivoDto> Sessoes);

public sealed record AoVivoDto(IReadOnlyList<ProjetoAoVivoDto> Projetos, DateTimeOffset AtualizadoEm);

/// <summary>
/// O que o Escritório mostra agora (polling): sessões com atividade nas últimas 12 h; as encerradas ficam só 2 min (a despedida).
/// Quem está "trabalhando" sem sinal há 30 min aparece como ociosa (o terminal pode ter sido fechado sem o SessionEnd).
/// </summary>
public sealed record ObterAoVivoQuery(Guid UsuarioId) : IQuery<AoVivoDto>;

internal sealed class ObterAoVivoHandler(ISessoesRepository sessoes, TimeProvider clock) : IQueryHandler<ObterAoVivoQuery, AoVivoDto>
{
    public async Task<Result<AoVivoDto>> Handle(ObterAoVivoQuery query, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var lista = await sessoes.ListarAoVivoAsync(query.UsuarioId, agora - SessaoAoVivo.ForaDoEscritorio,
            agora - SessaoAoVivo.DespedidaEncerrada, cancellationToken);

        var projetos = lista
            .GroupBy(s => s.ProjetoChave)
            .Select(g => new ProjetoAoVivoDto(g.Key, g.First().Projeto, g.Select(s => new SessaoAoVivoDto(
                s.SessaoId, s.Maquina, SessaoAoVivo.StatusVisto(s, agora),
                SessaoAoVivo.StatusVisto(s, agora) != s.Status ? "📴 Sem sinal há um tempo" : s.Atividade,
                s.Modelo, s.Uso.Entrada + (long)s.Uso.Saida + s.Uso.CacheLeitura + s.Uso.CacheEscrita, s.Uso.CacheLeitura,
                s.CustoUsd, s.Pedidos, s.IniciadaEm, s.UltimaAtividadeEm)).ToList()))
            .OrderByDescending(p => p.Sessoes.Max(s => s.UltimaAtividadeEm))
            .ToList();

        return new AoVivoDto(projetos, agora);
    }
}
