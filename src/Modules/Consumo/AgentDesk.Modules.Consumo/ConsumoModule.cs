using AgentDesk.Modules.Consumo.Application.Consumo;
using AgentDesk.Modules.Consumo.Application.DTOs;
using AgentDesk.Modules.Consumo.Domain;
using AgentDesk.Modules.Consumo.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Consumo;

/// <summary>
/// Consumo da API da Claude (tabela 7): log de cada chamada, painel (dia, mês, acumulado, por dia, ranking) e histórico.
/// Usa os contratos IConfiguracoesDeUso (limite mensal) e IDiretorioUsuarios (nomes no escopo TODOS).
/// </summary>
public sealed class ConsumoModule : IModule
{
    public string Nome => "Consumo";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        // Contrato para os outros módulos (Automacoes grava cada chamada e consulta o gasto do mês)
        services.AddScoped<IRegistroConsumo, RegistroConsumoRepository>();
        services.AddScoped<IConsumoConsultas, ConsumoConsultasRepository>();

        services.AddQueryHandler<ObterResumoQuery, ResumoConsumoDto, ObterResumoHandler>();
        services.AddQueryHandler<ListarChamadasQuery, PaginaChamadasDto, ListarChamadasHandler>();
        services.AddQueryHandler<ObterChamadaQuery, ChamadaDetalheDto, ObterChamadaHandler>();
        services.AddQueryHandler<ObterFiltrosQuery, FiltrosConsumoDto, ObterFiltrosHandler>();

        return services;
    }
}
