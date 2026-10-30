using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.SharedKernel.Web;

/// <summary>Converte um <see cref="Error"/> em resposta application/problem+json padronizada.</summary>
public static class ResultHttpExtensions
{
    public static IActionResult ToProblem(this ControllerBase controller, Error error)
        => CriarProblema(error, controller.HttpContext);

    /// <summary>Usado também por filtros de ação, onde não há ControllerBase.</summary>
    public static ObjectResult CriarProblema(Error error, HttpContext? httpContext)
    {
        var status = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
            ErrorType.Forbidden => StatusCodes.Status403Forbidden,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            ErrorType.Unprocessable => StatusCodes.Status422UnprocessableEntity,
            _ => StatusCodes.Status500InternalServerError,
        };

        ProblemDetails problem = error is ValidationError validation
            ? new ValidationProblemDetails(validation.Errors.ToDictionary(e => e.Key, e => e.Value))
            : new ProblemDetails();

        problem.Status = status;
        problem.Title = status == StatusCodes.Status500InternalServerError ? "Erro interno." : error.Message;
        problem.Instance = httpContext?.Request.Path.Value;
        problem.Extensions["code"] = error.Code;

        var result = new ObjectResult(problem) { StatusCode = status };
        result.ContentTypes.Add("application/problem+json");
        return result;
    }
}
