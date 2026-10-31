using System.Globalization;
using System.Text.Json;
using AgentDesk.Modules.Configuracoes.Domain;

namespace AgentDesk.Modules.Configuracoes.Infrastructure;

/// <summary>
/// PTAX do Banco Central (API aberta, sem chave): <c>CotacaoMoedaDia</c> devolve os boletins do dia (abertura, intermediários e
/// fechamento) com <c>cotacaoVenda</c> em reais. Usa o fechamento, ou o último boletim se o fechamento ainda não saiu.
/// </summary>
internal sealed class ClienteBcb(HttpClient http) : IClienteCotacoes
{
    public const string BaseUrl = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/";
    private const int DiasParaTras = 7;

    public async Task<(decimal BrlPorUnidade, DateOnly Data)?> UltimaAsync(string moeda, DateOnly hoje, CancellationToken cancellationToken)
    {
        for (var i = 0; i < DiasParaTras; i++)
        {
            var dia = hoje.AddDays(-i);
            if (dia.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
            var data = dia.ToString("MM-dd-yyyy", CultureInfo.InvariantCulture);
            var url = $"CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='{moeda}'&@dataCotacao='{data}'&$format=json";
            using var resposta = await http.GetAsync(url, cancellationToken);
            resposta.EnsureSuccessStatusCode();
            if (LerVenda(await resposta.Content.ReadAsStringAsync(cancellationToken)) is { } venda) return (venda, dia);
        }
        return null;
    }

    /// <summary>Venda do boletim de fechamento (ou do último boletim do dia). Null se o dia não tem cotação ou o formato é outro.</summary>
    internal static decimal? LerVenda(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("value", out var boletins) || boletins.ValueKind != JsonValueKind.Array) return null;
            var lista = boletins.EnumerateArray().Where(b => b.TryGetProperty("cotacaoVenda", out var v) && v.ValueKind == JsonValueKind.Number).ToList();
            if (lista.Count == 0) return null;
            var escolhido = lista.LastOrDefault(b => b.TryGetProperty("tipoBoletim", out var t) && t.GetString() == "Fechamento");
            if (escolhido.ValueKind == JsonValueKind.Undefined) escolhido = lista[^1];
            var venda = escolhido.GetProperty("cotacaoVenda").GetDecimal();
            return venda > 0 ? venda : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
