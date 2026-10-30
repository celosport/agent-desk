using FluentValidation;
using FluentValidation.Results;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.SharedKernel.Messaging;

/// <summary>
/// Fail-fast: executa todos os <see cref="IValidator{T}"/> do command antes do handler.
/// Se houver erros, o handler nem é chamado e o resultado vira <see cref="ValidationError"/> (HTTP 400).
/// </summary>
internal sealed class ValidationCommandHandlerDecorator<TCommand, TResponse>(
    ICommandHandler<TCommand, TResponse> inner,
    IEnumerable<IValidator<TCommand>> validators) : ICommandHandler<TCommand, TResponse>
    where TCommand : ICommand<TResponse>
{
    public async Task<Result<TResponse>> Handle(TCommand command, CancellationToken cancellationToken)
    {
        var failures = new List<ValidationFailure>();
        var context = new ValidationContext<TCommand>(command);

        foreach (var validator in validators)
        {
            var result = await validator.ValidateAsync(context, cancellationToken);
            failures.AddRange(result.Errors);
        }

        if (failures.Count == 0)
            return await inner.Handle(command, cancellationToken);

        var errors = failures
            .GroupBy(f => ToCamelCasePath(f.PropertyName))
            .ToDictionary(g => g.Key, g => g.Select(f => f.ErrorMessage).Distinct().ToArray());

        return Result.Failure<TResponse>(new ValidationError(errors));
    }

    // "Divisoes[0].Exercicios[1].Series" → "itens[0].nome" (mesmo formato do JSON)
    private static string ToCamelCasePath(string path) => string.Join('.',
        path.Split('.').Select(s => s.Length == 0 ? s : char.ToLowerInvariant(s[0]) + s[1..]));
}
