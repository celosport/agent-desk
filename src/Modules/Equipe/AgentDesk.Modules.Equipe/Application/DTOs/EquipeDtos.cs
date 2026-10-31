using AgentDesk.Modules.Equipe.Domain;

namespace AgentDesk.Modules.Equipe.Application.DTOs;

public sealed record AgenteDto(
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
    DateTimeOffset AtualizadoEm)
{
    internal static AgenteDto De(AgentePersonalizado a) => new(a.Alvo, a.Chave, a.Ordem, a.Nome, a.CorCabeca, a.CorCorpo, a.CorDetalhe,
        a.CorOlhos, a.Acessorio, a.Antena, a.Expressao, a.AtualizadoEm);
}

public sealed record SalvarAgenteRequestDto(
    string? Alvo,
    string? Chave,
    int? Ordem,
    string? Nome,
    string? CorCabeca,
    string? CorCorpo,
    string? CorDetalhe,
    string? CorOlhos,
    string? Acessorio,
    string? Antena,
    string? Expressao);
