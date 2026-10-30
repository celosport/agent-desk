namespace AgentDesk.SharedKernel.Contratos;

/// <summary>Preço de um modelo (US$ por milhão de tokens) e o cálculo do custo. Cache sem preço é cobrado como entrada.</summary>
public sealed record PrecoModelo(
    string ModeloId,
    string NomeExibicao,
    decimal EntradaMTok,
    decimal SaidaMTok,
    decimal? CacheLeituraMTok,
    decimal? CacheEscritaMTok,
    bool Ativo,
    bool FallbackRecusa)
{
    /// <summary>Custo em US$, arredondado em 6 casas (NUMERIC(14,6) no banco).</summary>
    public decimal CustoDe(UsoTokens uso) => Math.Round(
        (uso.Entrada * EntradaMTok
         + uso.Saida * SaidaMTok
         + uso.CacheLeitura * (CacheLeituraMTok ?? EntradaMTok)
         + uso.CacheEscrita * (CacheEscritaMTok ?? EntradaMTok)) / 1_000_000m,
        6, MidpointRounding.AwayFromZero);
}

/// <summary>O que outro módulo precisa saber do usuário para chamar a Claude. A chave vem decifrada e só vive na memória.</summary>
public sealed record PreferenciasDeUso(string? ChaveApi, string? ModeloPadraoId, decimal? LimiteMensalUsd, bool BloquearAoAtingirLimite);

/// <summary>Implementado pelo módulo Configuracoes (dono da API key e da tabela de modelos).</summary>
public interface IConfiguracoesDeUso
{
    Task<PreferenciasDeUso> ObterPreferenciasAsync(Guid usuarioId, CancellationToken cancellationToken);
    Task<PrecoModelo?> ObterModeloAsync(string modeloId, CancellationToken cancellationToken);
}
