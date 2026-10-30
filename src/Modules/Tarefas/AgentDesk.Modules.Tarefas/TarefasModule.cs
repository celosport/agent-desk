using AgentDesk.Modules.Tarefas.Application.DTOs;
using AgentDesk.Modules.Tarefas.Application.Tarefas.ConcluirTarefa;
using AgentDesk.Modules.Tarefas.Application.Tarefas.CriarTarefa;
using AgentDesk.Modules.Tarefas.Application.Tarefas.ListarTarefas;
using AgentDesk.Modules.Tarefas.Domain;
using AgentDesk.Modules.Tarefas.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Messaging;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Tarefas;

/// <summary>Exemplo de módulo: tarefas do usuário (tabela 2). Copie esta pasta para criar um módulo novo.</summary>
public sealed class TarefasModule : IModule
{
    public string Nome => "Tarefas";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ITarefasRepository, TarefasRepository>();

        // Registro explícito (sem reflection). Command ganha o decorator de validação; Query não.
        services.AddScoped<IValidator<CriarTarefaCommand>, CriarTarefaValidator>();
        services.AddCommandHandler<CriarTarefaCommand, TarefaDto, CriarTarefaHandler>();
        services.AddCommandHandler<ConcluirTarefaCommand, TarefaDto, ConcluirTarefaHandler>();
        services.AddQueryHandler<ListarTarefasQuery, IReadOnlyList<TarefaDto>, ListarTarefasHandler>();

        return services;
    }
}
