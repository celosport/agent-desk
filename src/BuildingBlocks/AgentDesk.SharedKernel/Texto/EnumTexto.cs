using System.Text.Json;

namespace AgentDesk.SharedKernel.Texto;

/// <summary>
/// Converte enums C# ↔ texto SNAKE_CASE_UPPER usado no banco e no JSON
/// (ex.: StatusChamada.Sucesso ↔ "SUCESSO"). Use nos repositórios Dapper.
/// </summary>
public static class EnumTexto
{
    public static string ToTexto<T>(this T valor) where T : struct, Enum
        => JsonNamingPolicy.SnakeCaseUpper.ConvertName(valor.ToString());

    public static T Parse<T>(string texto) where T : struct, Enum
    {
        foreach (var valor in Enum.GetValues<T>())
        {
            if (string.Equals(valor.ToTexto(), texto, StringComparison.OrdinalIgnoreCase))
                return valor;
        }

        throw new FormatException($"'{texto}' não é um valor válido de {typeof(T).Name}.");
    }
}
