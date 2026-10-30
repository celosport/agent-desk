using System.Data;
using Dapper;

namespace AgentDesk.Infrastructure.Data.TypeHandlers;

/// <summary>
/// TIMESTAMPTZ ↔ DateTimeOffset. O Npgsql lê TIMESTAMPTZ como DateTime (UTC) e só aceita gravar
/// DateTimeOffset com offset zero — este handler normaliza os dois sentidos para UTC.
/// </summary>
internal sealed class DateTimeOffsetTypeHandler : SqlMapper.TypeHandler<DateTimeOffset>
{
    public override void SetValue(IDbDataParameter parameter, DateTimeOffset value)
    {
        parameter.DbType = DbType.DateTimeOffset;
        parameter.Value = value.ToUniversalTime();
    }

    public override DateTimeOffset Parse(object value) => value switch
    {
        DateTimeOffset d => d,
        DateTime dt => new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc)),
        _ => throw new DataException($"Não foi possível converter '{value.GetType()}' para DateTimeOffset."),
    };
}
