using AgentDesk.Modules.Equipe.Application.Agentes.ListarAgentes;
using AgentDesk.Modules.Equipe.Application.Agentes.RestaurarAgente;
using AgentDesk.Modules.Equipe.Application.Agentes.SalvarAgente;
using AgentDesk.Modules.Equipe.Application.DTOs;
using AgentDesk.Modules.Equipe.Domain;
using AgentDesk.Modules.Equipe.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Messaging;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Equipe;

/// <summary>Nome e aparência dos agentes de cada usuário (tabela 9). [[ADR-011 - Equipe Personalizada (Nome e Aparência dos Agentes)]]</summary>
public sealed class EquipeModule : IModule
{
    public string Nome => "Equipe";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IEquipeRepository, EquipeRepository>();

        services.AddScoped<IValidator<SalvarAgenteCommand>, SalvarAgenteValidator>();

        services.AddQueryHandler<ListarAgentesQuery, IReadOnlyList<AgenteDto>, ListarAgentesHandler>();
        services.AddCommandHandler<SalvarAgenteCommand, AgenteDto, SalvarAgenteHandler>();
        services.AddCommandHandler<RestaurarAgenteCommand, bool, RestaurarAgenteHandler>();

        return services;
    }
}
