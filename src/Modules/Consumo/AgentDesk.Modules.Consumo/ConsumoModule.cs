using AgentDesk.Modules.Consumo.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Consumo;

/// <summary>Consumo da API da Claude (tabela 7): log de cada chamada. Painel e histórico chegam na Fase 3.</summary>
public sealed class ConsumoModule : IModule
{
    public string Nome => "Consumo";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        // Contrato para os outros módulos (Automacoes grava cada chamada e consulta o gasto do mês)
        services.AddScoped<IRegistroConsumo, RegistroConsumoRepository>();
        return services;
    }
}
