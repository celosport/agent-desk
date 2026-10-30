using FluentValidation;
using AgentDesk.Modules.Contas.Application.Auth;
using AgentDesk.Modules.Contas.Domain;
using AgentDesk.Modules.Contas.Infrastructure;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Contas;

/// <summary>Contas e autenticação (tabela 1): cadastro e login com JWT.</summary>
public sealed class ContasModule : IModule
{
    public string Nome => "Contas";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IUsuariosRepository, UsuariosRepository>();
        services.AddScoped<IDiretorioUsuarios, DiretorioUsuarios>(); // contrato para os outros módulos (só nomes)

        services.AddScoped<IValidator<CadastrarCommand>, CadastrarValidator>();
        services.AddScoped<IValidator<LoginCommand>, LoginValidator>();
        services.AddCommandHandler<CadastrarCommand, SessaoDto, CadastrarHandler>();
        services.AddCommandHandler<LoginCommand, SessaoDto, LoginHandler>();

        return services;
    }
}
