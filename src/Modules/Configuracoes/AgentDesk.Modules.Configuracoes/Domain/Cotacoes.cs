using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Domain;

/// <summary>Quantos reais vale 1 unidade da moeda (PTAX de venda do Banco Central) e o dia da cotação.</summary>
internal sealed record CotacaoBrl(string Moeda, decimal BrlPorUnidade, DateOnly DataCotacao, DateTimeOffset BuscadaEm);

internal static class Moedas
{
    public const string Dolar = "USD";
    public const string Euro = "EUR";
    public const string Libra = "GBP";

    /// <summary>As moedas buscadas no Banco Central (o real é a base da PTAX).</summary>
    public static readonly string[] Buscadas = [Dolar, Euro, Libra];
}

/// <summary>Taxas por 1 US$: o app multiplica o valor em dólar pela taxa da moeda escolhida.</summary>
internal sealed record TaxasPorDolar(IReadOnlyDictionary<string, decimal> Taxas, DateOnly DataCotacao, DateTimeOffset AtualizadaEm);

internal static class Conversao
{
    /// <summary>
    /// Converte as cotações em reais para taxas por dólar: BRL = PTAX do dólar; EUR = PTAX do dólar ÷ PTAX do euro; idem GBP.
    /// Sem a cotação do dólar não há como converter (null); euro ou libra ausentes simplesmente não entram. Data = a mais antiga usada.
    /// </summary>
    public static TaxasPorDolar? PorDolar(IReadOnlyList<CotacaoBrl> cotacoes)
    {
        var dolar = cotacoes.FirstOrDefault(c => c.Moeda == Moedas.Dolar);
        if (dolar is null) return null;

        var taxas = new Dictionary<string, decimal> { [Moedas.Dolar] = 1m, ["BRL"] = Math.Round(dolar.BrlPorUnidade, 6) };
        foreach (var moeda in new[] { Moedas.Euro, Moedas.Libra })
            if (cotacoes.FirstOrDefault(c => c.Moeda == moeda) is { } c) taxas[moeda] = Math.Round(dolar.BrlPorUnidade / c.BrlPorUnidade, 6);

        var usadas = cotacoes.Where(c => taxas.ContainsKey(c.Moeda) || c.Moeda == Moedas.Dolar).ToList();
        return new TaxasPorDolar(taxas, usadas.Min(c => c.DataCotacao), usadas.Max(c => c.BuscadaEm));
    }
}

internal static class CotacaoErros
{
    public static readonly Error Indisponivel = Error.Unavailable(
        "Cotacoes.Indisponivel", "A cotação das moedas ainda não está disponível. Os valores seguem em dólar.");
}

internal interface ICotacoesRepository
{
    Task SalvarAsync(CotacaoBrl cotacao, CancellationToken cancellationToken);
    Task<IReadOnlyList<CotacaoBrl>> ListarAsync(CancellationToken cancellationToken);
}

/// <summary>Busca a cotação (PTAX de venda) mais recente de uma moeda, olhando até 7 dias para trás (fim de semana e feriado não têm).</summary>
internal interface IClienteCotacoes
{
    /// <returns>Null se o Banco Central não tem cotação nos últimos 7 dias. Falha de rede lança <see cref="HttpRequestException"/>.</returns>
    Task<(decimal BrlPorUnidade, DateOnly Data)?> UltimaAsync(string moeda, DateOnly hoje, CancellationToken cancellationToken);
}
