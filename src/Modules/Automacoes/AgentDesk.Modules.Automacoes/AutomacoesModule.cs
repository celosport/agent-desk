using AgentDesk.Modules.Automacoes.Application.Automacoes.AtualizarAutomacao;
using AgentDesk.Modules.Automacoes.Application.Automacoes.ExecutarAutomacao;
using AgentDesk.Modules.Automacoes.Application.Automacoes.ListarAutomacoes;
using AgentDesk.Modules.Automacoes.Application.DTOs;
using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.Modules.Automacoes.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Messaging;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Automacoes;

/// <summary>
/// Automações em 1 clique (tabela 6). Usa os contratos IConfiguracoesDeUso (chave, modelo, limite, preço) e IRegistroConsumo
/// (grava cada chamada) — implementados pelos módulos Configuracoes e Consumo. Nunca os referencia diretamente.
/// </summary>
public sealed class AutomacoesModule : IModule
{
    public string Nome => "Automacoes";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IAutomacoesRepository, AutomacoesRepository>();

        services.AddScoped<IValidator<AtualizarAutomacaoCommand>, AtualizarAutomacaoValidator>();
        services.AddScoped<IValidator<ExecutarAutomacaoCommand>, ExecutarAutomacaoValidator>();

        services.AddQueryHandler<ListarAutomacoesQuery, IReadOnlyList<AutomacaoDto>, ListarAutomacoesHandler>();
        services.AddCommandHandler<AtualizarAutomacaoCommand, AutomacaoDto, AtualizarAutomacaoHandler>();
        services.AddCommandHandler<ExecutarAutomacaoCommand, ExecucaoDto, ExecutarAutomacaoHandler>();

        return services;
    }
}
