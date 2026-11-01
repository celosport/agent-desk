using AgentDesk.Modules.Notificacoes.Application;
using AgentDesk.Modules.Notificacoes.Domain;
using AgentDesk.Modules.Notificacoes.Infrastructure;
using AgentDesk.Modules.Notificacoes.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Messaging;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Notificacoes;

/// <summary>Alertas push no celular (tabelas 10): aparelhos inscritos, preferências e o envio. [[ADR-016 - Alertas no Celular (Push do App)]]</summary>
public sealed class NotificacoesModule : IModule
{
    public string Nome => "Notificacoes";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<INotificacoesRepository, NotificacoesRepository>();
        services.AddHttpClient(EnviadorWebPush.NomeDoCliente, c => c.Timeout = TimeSpan.FromSeconds(15));
        services.AddScoped<IEnviadorPush, EnviadorWebPush>();
        services.AddScoped<Notificador>();
        // Contrato do SharedKernel: Automacoes e Sessoes chamam sem conhecer este módulo
        services.AddScoped<INotificador>(sp => sp.GetRequiredService<Notificador>());

        services.AddScoped<IValidator<RegistrarDispositivoCommand>, RegistrarDispositivoValidator>();

        services.AddQueryHandler<ObterNotificacoesQuery, NotificacoesDto, ObterNotificacoesHandler>();
        services.AddCommandHandler<RegistrarDispositivoCommand, DispositivoDto, RegistrarDispositivoHandler>();
        services.AddCommandHandler<RemoverDispositivoCommand, bool, RemoverDispositivoHandler>();
        services.AddCommandHandler<SalvarPreferenciasCommand, PreferenciasAlertaDto, SalvarPreferenciasHandler>();
        services.AddCommandHandler<EnviarTesteCommand, EnvioTesteDto, EnviarTesteHandler>();

        return services;
    }
}
