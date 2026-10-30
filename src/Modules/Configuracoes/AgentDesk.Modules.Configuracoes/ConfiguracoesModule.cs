using AgentDesk.Modules.Configuracoes.Application.Configuracoes.ObterConfiguracao;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.RemoverChaveApi;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.SalvarChaveApi;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.SalvarPreferencias;
using AgentDesk.Modules.Configuracoes.Application.Configuracoes.TestarChaveApi;
using AgentDesk.Modules.Configuracoes.Application.Contratos;
using AgentDesk.Modules.Configuracoes.Application.DTOs;
using AgentDesk.Modules.Configuracoes.Application.Modelos.AtualizarModelo;
using AgentDesk.Modules.Configuracoes.Application.Modelos.CriarModelo;
using AgentDesk.Modules.Configuracoes.Application.Modelos.ListarModelos;
using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.Modules.Configuracoes.Infrastructure;
using AgentDesk.Modules.Configuracoes.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Configuracoes;

/// <summary>API key da Anthropic (cifrada), modelo padrão, limite de gasto e a tabela de modelos/preços (tabelas 4 e 5).</summary>
public sealed class ConfiguracoesModule : IModule
{
    public string Nome => "Configuracoes";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IConfiguracoesRepository, ConfiguracoesRepository>();
        services.AddScoped<IModelosRepository, ModelosRepository>();
        services.AddSingleton<ICofreChaves, CofreChaves>();

        // Contrato para os outros módulos (Automacoes): chave decifrada, preferências e preço do modelo
        services.AddScoped<IConfiguracoesDeUso, ConfiguracoesDeUso>();

        services.AddScoped<IValidator<SalvarChaveApiCommand>, SalvarChaveApiValidator>();
        services.AddScoped<IValidator<SalvarPreferenciasCommand>, SalvarPreferenciasValidator>();
        services.AddScoped<IValidator<CriarModeloCommand>, CriarModeloValidator>();
        services.AddScoped<IValidator<AtualizarModeloCommand>, AtualizarModeloValidator>();

        services.AddQueryHandler<ObterConfiguracaoQuery, ConfiguracaoDto, ObterConfiguracaoHandler>();
        services.AddCommandHandler<SalvarChaveApiCommand, ConfiguracaoDto, SalvarChaveApiHandler>();
        services.AddCommandHandler<RemoverChaveApiCommand, ConfiguracaoDto, RemoverChaveApiHandler>();
        services.AddCommandHandler<TestarChaveApiCommand, TesteChaveDto, TestarChaveApiHandler>();
        services.AddCommandHandler<SalvarPreferenciasCommand, ConfiguracaoDto, SalvarPreferenciasHandler>();

        services.AddQueryHandler<ListarModelosQuery, IReadOnlyList<ModeloDto>, ListarModelosHandler>();
        services.AddCommandHandler<CriarModeloCommand, ModeloDto, CriarModeloHandler>();
        services.AddCommandHandler<AtualizarModeloCommand, ModeloDto, AtualizarModeloHandler>();

        return services;
    }
}
