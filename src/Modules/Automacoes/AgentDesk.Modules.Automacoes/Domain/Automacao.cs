using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Automacoes.Domain;

/// <summary>
/// Fluxo de 1 clique: um prompt de sistema e um modelo de mensagem com <c>{{entrada}}</c>, onde entra o texto do usuário.
/// <c>ModeloId</c> nulo = usa o modelo padrão do usuário. O <c>Codigo</c> é estável (o personagem do Escritório usa).
/// </summary>
internal sealed record Automacao(
    Guid AutomacaoId,
    string Codigo,
    string Nome,
    string Descricao,
    string PromptSistema,
    string ModeloMensagem,
    string? ModeloId,
    int MaxTokens,
    bool Ativa,
    int Ordem,
    DateTimeOffset AtualizadaEm)
{
    public const string MarcadorEntrada = "{{entrada}}";

    public string MontarMensagem(string entrada) => ModeloMensagem.Replace(MarcadorEntrada, entrada, StringComparison.Ordinal);
}

internal static class AutomacaoErros
{
    public static readonly Error NaoEncontrada = Error.NotFound("Automacoes.NaoEncontrada", "Automação não encontrada.");

    public static readonly Error ChaveNaoConfigurada = Error.Unprocessable(
        "Automacoes.ChaveNaoConfigurada", "Cadastre a sua API key da Anthropic em Configurações para rodar as automações.");

    public static readonly Error ModeloNaoDefinido = Error.Unprocessable(
        "Automacoes.ModeloNaoDefinido", "Escolha um modelo (ou defina o seu modelo padrão em Configurações).");

    public static readonly Error ModeloInvalido = Error.Unprocessable(
        "Automacoes.ModeloInvalido", "Este modelo não está ativo na tabela de modelos. Escolha outro.");

    public static readonly Error Recusada = Error.Unprocessable(
        "Automacoes.Recusada", "A Claude recusou este pedido (filtro de segurança). Os tokens usados foram registrados no consumo.");

    public static readonly Error Cancelada = Error.Unprocessable(
        "Automacoes.Cancelada", "Execução cancelada. A Anthropic pode ter cobrado os tokens de entrada, que não aparecem no consumo.");

    public static readonly Error ExecucaoNaoEncontrada = Error.NotFound(
        "Automacoes.ExecucaoNaoEncontrada", "Não há execução em andamento com este id (talvez já tenha terminado).");

    public static readonly Error ExecucaoDuplicada = Error.Conflict(
        "Automacoes.ExecucaoDuplicada", "Já existe uma execução em andamento com este id.");

    public static Error LimiteMensalAtingido(decimal gasto, decimal limite) => Error.Unprocessable(
        "Automacoes.LimiteMensalAtingido",
        $"Você atingiu o limite de gasto do mês (US$ {gasto:0.00} de US$ {limite:0.00}). Aumente o limite em Configurações ou espere o próximo mês.");
}

internal interface IAutomacoesRepository
{
    Task<IReadOnlyList<Automacao>> ListarAsync(bool incluirInativas, CancellationToken cancellationToken);
    Task<Automacao?> ObterAsync(Guid automacaoId, CancellationToken cancellationToken);

    /// <summary>False se a automação não existe.</summary>
    Task<bool> AtualizarAsync(Automacao automacao, CancellationToken cancellationToken);
}
