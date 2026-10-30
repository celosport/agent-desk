using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.SharedKernel.Messaging;

/// <summary>Registro explícito de handlers (sem scan por reflection), chamado no IModule de cada módulo.</summary>
public static class HandlerRegistrationExtensions
{
    /// <summary>Registra o handler do command já envolvido pelo decorator de validação.</summary>
    public static IServiceCollection AddCommandHandler<TCommand, TResponse, THandler>(this IServiceCollection services)
        where TCommand : ICommand<TResponse>
        where THandler : class, ICommandHandler<TCommand, TResponse>
    {
        services.AddScoped<THandler>();
        services.AddScoped<ICommandHandler<TCommand, TResponse>>(sp =>
            new ValidationCommandHandlerDecorator<TCommand, TResponse>(
                sp.GetRequiredService<THandler>(),
                sp.GetServices<FluentValidation.IValidator<TCommand>>()));
        return services;
    }

    public static IServiceCollection AddQueryHandler<TQuery, TResponse, THandler>(this IServiceCollection services)
        where TQuery : IQuery<TResponse>
        where THandler : class, IQueryHandler<TQuery, TResponse>
    {
        services.AddScoped<IQueryHandler<TQuery, TResponse>, THandler>();
        return services;
    }
}
