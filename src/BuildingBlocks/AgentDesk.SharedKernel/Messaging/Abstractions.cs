using AgentDesk.SharedKernel.Results;

namespace AgentDesk.SharedKernel.Messaging;

// CQRS leve, sem MediatR — ver ADR-002.
// Commands alteram estado; Queries apenas leem. Ambos retornam Result<T>.

/// <summary>Marca uma operação de escrita que produz <typeparamref name="TResponse"/>.</summary>
public interface ICommand<TResponse> { }

/// <summary>Marca uma operação de leitura que produz <typeparamref name="TResponse"/>.</summary>
public interface IQuery<TResponse> { }

public interface ICommandHandler<in TCommand, TResponse> where TCommand : ICommand<TResponse>
{
    Task<Result<TResponse>> Handle(TCommand command, CancellationToken cancellationToken);
}

public interface IQueryHandler<in TQuery, TResponse> where TQuery : IQuery<TResponse>
{
    Task<Result<TResponse>> Handle(TQuery query, CancellationToken cancellationToken);
}
