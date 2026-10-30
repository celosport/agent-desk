using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.SharedKernel;

/// <summary>
/// Contrato de registro de cada módulo do Monólito Modular.
/// O Host apenas chama RegisterServices — não conhece as classes internas do módulo.
/// </summary>
public interface IModule
{
    string Nome { get; }
    IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration);
}
