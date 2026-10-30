namespace AgentDesk.SharedKernel.Results;

/// <summary>Categoria do erro — define o status HTTP em <see cref="Web.ResultHttpExtensions"/>.</summary>
public enum ErrorType
{
    Failure,        // 500
    Validation,     // 400
    Unauthorized,   // 401 (credenciais inválidas)
    Forbidden,      // 403
    NotFound,       // 404
    Conflict,       // 409
    Unprocessable,  // 422 (regra de negócio / referência inexistente)
    Unavailable,    // 503 (serviço externo fora do ar ou limitando; a mensagem é exibida)
}

/// <summary>Erro de negócio esperado. Exceções ficam reservadas para falhas inesperadas.</summary>
/// <param name="Code">Código estável para o cliente (ex.: "Automacoes.NaoEncontrada").</param>
/// <param name="Message">Mensagem em português, segura para exibir ao usuário.</param>
public record Error(string Code, string Message, ErrorType Type)
{
    public static readonly Error None = new(string.Empty, string.Empty, ErrorType.Failure);

    public static Error Failure(string code, string message) => new(code, message, ErrorType.Failure);
    public static Error NotFound(string code, string message) => new(code, message, ErrorType.NotFound);
    public static Error Conflict(string code, string message) => new(code, message, ErrorType.Conflict);
    public static Error Unauthorized(string code, string message) => new(code, message, ErrorType.Unauthorized);
    public static Error Forbidden(string code, string message) => new(code, message, ErrorType.Forbidden);
    public static Error Unprocessable(string code, string message) => new(code, message, ErrorType.Unprocessable);
    public static Error Unavailable(string code, string message) => new(code, message, ErrorType.Unavailable);
}

/// <summary>Falha de validação de entrada, com as mensagens agrupadas por campo (camelCase).</summary>
public sealed record ValidationError(IReadOnlyDictionary<string, string[]> Errors)
    : Error("Validacao.Falhou", "Um ou mais campos são inválidos.", ErrorType.Validation);
