using System.Data;
using Dapper;

namespace AgentDesk.Infrastructure.Data.TypeHandlers;

/// <summary>
/// Mapeia colunas DATE (data_inicio, data_vencimento, data_avaliacao…) para DateOnly.
/// O Dapper 2.1 não trata DateOnly nativamente; sem este handler a leitura falha.
/// </summary>
internal sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value; // Npgsql 8 aceita DateOnly diretamente
    }

    public override DateOnly Parse(object value) => value switch
    {
        DateOnly d => d,
        DateTime dt => DateOnly.FromDateTime(dt),
        _ => throw new DataException($"Não foi possível converter '{value.GetType()}' para DateOnly.")
    };
}
