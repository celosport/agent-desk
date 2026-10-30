using AgentDesk.Infrastructure.Data.TypeHandlers;
using Dapper;

namespace AgentDesk.Infrastructure.Data;

/// <summary>Configuração global e única do Dapper (chamada uma vez no startup).</summary>
internal static class DapperConfig
{
    private static int _configurado;

    public static void Configure()
    {
        if (Interlocked.Exchange(ref _configurado, 1) == 1) return;

        // snake_case do PostgreSQL (tarefa_id) ↔ PascalCase do C# (TarefaId) sem precisar de "AS" em todo SELECT
        DefaultTypeMap.MatchNamesWithUnderscores = true;

        SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
        SqlMapper.AddTypeHandler(new DateTimeOffsetTypeHandler());
    }
}
