namespace AgentDesk.SharedKernel.Tempo;

/// <summary>
/// "Hoje" e "este mês" contam no fuso de America/Sao_Paulo (o banco guarda UTC). Funções puras: o "agora" vem de um
/// <see cref="TimeProvider"/> injetado, nunca de DateTime.Now.
/// </summary>
public static class FusoBrasil
{
    /// <summary>Id IANA (o PostgreSQL usa o mesmo em <c>AT TIME ZONE</c>).</summary>
    public const string Id = "America/Sao_Paulo";

    public static readonly TimeZoneInfo Fuso = TimeZoneInfo.FindSystemTimeZoneById(Id);

    /// <summary>[início, fim) do mês local de <paramref name="agora"/>, em UTC.</summary>
    public static (DateTimeOffset Inicio, DateTimeOffset Fim) Mes(DateTimeOffset agora)
    {
        var local = TimeZoneInfo.ConvertTime(agora, Fuso);
        var inicio = new DateTime(local.Year, local.Month, 1);
        return (ParaUtc(inicio), ParaUtc(inicio.AddMonths(1)));
    }

    /// <summary>[início, fim) do dia local de <paramref name="agora"/>, em UTC.</summary>
    public static (DateTimeOffset Inicio, DateTimeOffset Fim) Dia(DateTimeOffset agora)
    {
        var local = TimeZoneInfo.ConvertTime(agora, Fuso).Date;
        return (ParaUtc(local), ParaUtc(local.AddDays(1)));
    }

    /// <summary>A data de <paramref name="agora"/> no calendário de Brasília.</summary>
    public static DateOnly DataLocal(DateTimeOffset agora) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(agora, Fuso).DateTime);

    /// <summary>Meia-noite de Brasília do dia <paramref name="dia"/>, em UTC.</summary>
    public static DateTimeOffset InicioDoDia(DateOnly dia) => ParaUtc(dia.ToDateTime(TimeOnly.MinValue));

    private static DateTimeOffset ParaUtc(DateTime localSemFuso)
        => new(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(localSemFuso, DateTimeKind.Unspecified), Fuso), TimeSpan.Zero);
}
