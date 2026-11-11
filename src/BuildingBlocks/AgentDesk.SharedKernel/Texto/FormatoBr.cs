using System.Globalization;

namespace AgentDesk.SharedKernel.Texto;

/// <summary>
/// Formato brasileiro para textos montados no servidor (vírgula nos decimais, ponto nos milhares, dia/mês). Não depende da cultura
/// do computador nem de o ICU estar instalado: antes, <c>{valor:0.00}</c> saía "9,00" no Windows do desenvolvedor e "9.00" no Linux
/// do CI e da nuvem. Uso: <c>string.Create(FormatoBr.Provedor, $"... {valor:0.00} ...")</c>.
/// </summary>
public static class FormatoBr
{
    public static readonly CultureInfo Provedor = Criar();

    private static CultureInfo Criar()
    {
        var cultura = (CultureInfo)CultureInfo.InvariantCulture.Clone();
        cultura.NumberFormat.NumberDecimalSeparator = ",";
        cultura.NumberFormat.NumberGroupSeparator = ".";
        cultura.NumberFormat.CurrencyDecimalSeparator = ",";
        cultura.NumberFormat.CurrencyGroupSeparator = ".";
        return cultura;
    }
}
