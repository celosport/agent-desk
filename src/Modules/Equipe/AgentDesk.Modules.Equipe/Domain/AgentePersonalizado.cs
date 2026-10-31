using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Equipe.Domain;

/// <summary>
/// Nome e aparência de um agente do Escritório. Alvo AUTOMACAO: chave = código da automação (ordem 0). Alvo PROJETO: chave = projeto_chave
/// das sessões e ordem = posição na equipe. [[ADR-011 - Equipe Personalizada (Nome e Aparência dos Agentes)]]
/// </summary>
internal sealed record AgentePersonalizado(
    Guid AgenteId,
    Guid UsuarioId,
    string Alvo,
    string Chave,
    int Ordem,
    string Nome,
    string CorCabeca,
    string CorCorpo,
    string CorDetalhe,
    string CorOlhos,
    string Acessorio,
    string Antena,
    string Expressao,
    DateTimeOffset AtualizadoEm);

/// <summary>Valores aceitos (espelham os CHECKs de <c>agentes_personalizados</c>).</summary>
internal static class OpcoesAgente
{
    public const string Automacao = "AUTOMACAO";
    public const string Projeto = "PROJETO";
    public const int OrdemMaxima = 7;

    public static readonly IReadOnlySet<string> Alvos = new HashSet<string> { Automacao, Projeto };
    public static readonly IReadOnlySet<string> Acessorios = new HashSet<string> { "NENHUM", "BONE", "CHAPEU", "FONE", "OCULOS", "GRAVATA", "LACO", "COROA" };
    public static readonly IReadOnlySet<string> Antenas = new HashSet<string> { "RETA", "BOLINHA", "DUPLA", "NENHUMA" };
    public static readonly IReadOnlySet<string> Expressoes = new HashSet<string> { "NORMAL", "FELIZ", "CONCENTRADO", "SONOLENTO" };
}

internal static class AgenteErros
{
    public static readonly Error NaoEncontrado = Error.NotFound("Equipe.AgenteNaoEncontrado", "Agente personalizado não encontrado.");
}

internal interface IEquipeRepository
{
    Task<IReadOnlyList<AgentePersonalizado>> ListarAsync(Guid usuarioId, CancellationToken cancellationToken);

    /// <summary>Insere ou atualiza pela chave (usuário, alvo, chave, ordem) e devolve o que ficou gravado.</summary>
    Task<AgentePersonalizado> SalvarAsync(AgentePersonalizado agente, CancellationToken cancellationToken);

    /// <summary>False se não havia personalização (o agente já está no padrão do Escritório).</summary>
    Task<bool> RemoverAsync(Guid usuarioId, string alvo, string chave, int ordem, CancellationToken cancellationToken);
}
