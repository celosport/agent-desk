using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Application.Cotacoes;

/// <param name="Base">Sempre "USD": os valores do app são calculados em dólar.</param>
/// <param name="Taxas">Quanto vale 1 US$ em cada moeda (USD, BRL, EUR, GBP). Euro e libra podem faltar.</param>
/// <param name="DataCotacao">Dia da PTAX usada (a mais antiga entre as moedas).</param>
public sealed record CotacoesDto(string Base, IReadOnlyDictionary<string, decimal> Taxas, DateOnly DataCotacao, string Fonte, DateTimeOffset AtualizadaEm);

public sealed record ObterCotacoesQuery : IQuery<CotacoesDto>;

internal sealed class ObterCotacoesHandler(ICotacoesRepository repositorio) : IQueryHandler<ObterCotacoesQuery, CotacoesDto>
{
    public const string Fonte = "PTAX do Banco Central (venda)";

    public async Task<Result<CotacoesDto>> Handle(ObterCotacoesQuery query, CancellationToken cancellationToken)
    {
        var taxas = Conversao.PorDolar(await repositorio.ListarAsync(cancellationToken));
        if (taxas is null) return CotacaoErros.Indisponivel;
        return new CotacoesDto(Moedas.Dolar, taxas.Taxas, taxas.DataCotacao, Fonte, taxas.AtualizadaEm);
    }
}
