using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Configuracoes.Domain;

/// <summary>
/// Modelo da Claude com o preço em US$ por milhão de tokens. O id é o da API da Anthropic (ex.: "claude-opus-5-5").
/// Nada disso fica no código: a tabela é mantida pelo ADMIN. [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]
/// </summary>
internal sealed record ModeloClaude(
    string ModeloId,
    string NomeExibicao,
    decimal PrecoEntradaMTok,
    decimal PrecoSaidaMTok,
    decimal? PrecoCacheLeituraMTok,
    decimal? PrecoCacheEscritaMTok,
    bool Ativo,
    DateTimeOffset AtualizadoEm);

internal static class ModeloErros
{
    public static readonly Error NaoEncontrado = Error.NotFound("Modelos.NaoEncontrado", "Modelo não encontrado.");
    public static readonly Error JaExiste = Error.Conflict("Modelos.JaExiste", "Já existe um modelo com este id.");
}

internal interface IModelosRepository
{
    Task<IReadOnlyList<ModeloClaude>> ListarAsync(CancellationToken cancellationToken);
    Task<ModeloClaude?> ObterAsync(string modeloId, CancellationToken cancellationToken);

    /// <summary>False se o id já existe.</summary>
    Task<bool> InserirAsync(ModeloClaude modelo, CancellationToken cancellationToken);

    /// <summary>False se o modelo não existe.</summary>
    Task<bool> AtualizarAsync(ModeloClaude modelo, CancellationToken cancellationToken);
}
