using AgentDesk.Modules.Contas;
using AgentDesk.Modules.Tarefas;
using AgentDesk.SharedKernel;

namespace AgentDesk.API;

internal static class ModuleExtensions
{
    // Lista explícita (sem reflection): ativar/desativar um módulo é uma linha.
    private static readonly IModule[] Modulos =
    [
        new ContasModule(),
        new TarefasModule(),
    ];

    /// <summary>Registra os serviços de cada módulo e expõe os controllers que vivem dentro deles.</summary>
    public static IMvcBuilder AddModules(this IServiceCollection services, IConfiguration configuration)
    {
        var mvc = services.AddControllers();

        foreach (var modulo in Modulos)
        {
            modulo.RegisterServices(services, configuration);
            mvc.AddApplicationPart(modulo.GetType().Assembly);
        }

        return mvc;
    }
}
