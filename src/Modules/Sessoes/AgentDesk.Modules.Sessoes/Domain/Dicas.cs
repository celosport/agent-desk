using AgentDesk.SharedKernel.Tempo;

namespace AgentDesk.Modules.Sessoes.Domain;

/// <summary>Uma sessão do Claude Code com o que as dicas precisam saber dela (últimos dias).</summary>
internal sealed record SessaoResumo(
    Guid UsuarioId,
    string SessaoId,
    string Projeto,
    string ProjetoChave,
    string? Modelo,
    UsoCc Uso,
    DateTimeOffset IniciadaEm,
    DateTimeOffset UltimaAtividadeEm,
    DateTimeOffset? EncerradaEm,
    int Compactacoes,
    int Edicoes);

/// <param name="Regra">Código estável da regra (a tela pode escolher o ícone por ele).</param>
/// <param name="EconomiaUsd">Estimativa grosseira do que daria para economizar (US$ na API), não uma promessa.</param>
internal sealed record Dica(string Regra, string Titulo, string Texto, string? Projeto, string? SessaoId, decimal EconomiaUsd);

/// <summary>
/// As 5 regras de dicas, calculadas sobre os últimos 7 dias (funções puras, testáveis sem banco). Os limites são conservadores:
/// melhor poucas dicas boas do que ruído. A economia é uma estimativa e vem sempre rotulada assim na tela.
/// </summary>
internal static class RegrasDicas
{
    public const int Dias = 7;

    // cache baixo numa sessão longa
    public const long CacheBaixoPedidosMinimos = 20;
    public const decimal CacheAlvo = 0.8m;

    // sessão gigante
    public const long SessaoGiganteTokens = 20_000_000;
    public const long SessaoGigantePedidos = 150;

    // muitas compactações
    public const int CompactacoesMinimas = 3;

    // modelo caro em sessão simples
    public const long ModeloCaroPedidosMinimos = 10;
    public const int EdicoesNaSessaoSimples = 3;
    public static readonly string[] ModelosCaros = ["opus", "fable"];

    // dia fora da curva
    public const decimal ForaDaCurvaVezes = 2m;
    public const int DiasMinimosParaMedia = 3;
    public const decimal ForaDaCurvaCustoMinimo = 1m;

    public static IReadOnlyList<Dica> Calcular(IReadOnlyList<SessaoResumo> sessoes, IReadOnlyList<UsoDia> dias)
    {
        var dicas = new List<Dica>();
        foreach (var s in sessoes)
        {
            var nome = $"{s.Projeto} ({Curto(s.SessaoId)})";

            if (s.Uso.Pedidos >= CacheBaixoPedidosMinimos && s.Uso.TaxaCache is { } taxa && taxa < RegrasCache.TaxaMinima)
                dicas.Add(new Dica("CACHE_BAIXO", "Cache baixo numa sessão longa",
                    $"A sessão {nome} reaproveitou só {Math.Round(taxa * 100)}% do contexto em {s.Uso.Pedidos} pedidos. Contexto que muda toda hora " +
                    "(arquivos enormes, ferramentas reordenadas) derruba o cache: mantenha o início da conversa estável e evite colar blocos grandes que mudam.",
                    s.Projeto, s.SessaoId, Economia(s.Uso.CustoUsd * (CacheAlvo - taxa) * 0.5m)));

            if (s.Uso.Tokens >= SessaoGiganteTokens || s.Uso.Pedidos >= SessaoGigantePedidos)
                dicas.Add(new Dica("SESSAO_GIGANTE", "Sessão gigante",
                    $"A sessão {nome} tem {s.Uso.Pedidos} pedidos e {s.Uso.Tokens / 1_000_000m:0.#} mi de tokens. Cada pedido reenvia o contexto inteiro: " +
                    "use /clear ou abra uma sessão nova por tarefa.",
                    s.Projeto, s.SessaoId, Economia(s.Uso.CustoUsd * 0.25m)));

            if (s.Compactacoes >= CompactacoesMinimas)
                dicas.Add(new Dica("MUITAS_COMPACTACOES", "Muitas compactações",
                    $"O contexto da sessão {nome} estourou {s.Compactacoes} vezes e foi compactado. Divida o trabalho em sessões menores " +
                    "ou rode /clear entre as tarefas.",
                    s.Projeto, s.SessaoId, Economia(s.Uso.CustoUsd * 0.15m)));

            if (s.Uso.Pedidos >= ModeloCaroPedidosMinimos && s.Edicoes <= EdicoesNaSessaoSimples && ModeloCaro(s.Modelo))
                dicas.Add(new Dica("MODELO_CARO", "Modelo caro em sessão simples",
                    $"A sessão {nome} usou {s.Modelo} com só {s.Edicoes} edição(ões) de arquivo em {s.Uso.Pedidos} pedidos. " +
                    "Para leitura, perguntas e ajustes pequenos, experimente o Sonnet.",
                    s.Projeto, s.SessaoId, Economia(s.Uso.CustoUsd * 0.6m)));
        }

        var foraDaCurva = DiaForaDaCurva(dias);
        if (foraDaCurva is { } f) dicas.Add(f);

        return dicas.OrderByDescending(d => d.EconomiaUsd).ThenBy(d => d.Regra).ToList();
    }

    /// <summary>Custo do dia acima de 2× a média dos outros dias com uso (precisa de pelo menos 3 dias de uso e US$ 1 no dia).</summary>
    private static Dica? DiaForaDaCurva(IReadOnlyList<UsoDia> dias)
    {
        var comUso = dias.Where(d => d.Uso.Pedidos > 0).ToList();
        if (comUso.Count < DiasMinimosParaMedia) return null;

        Dica? pior = null;
        foreach (var d in comUso)
        {
            var outros = comUso.Where(o => o.Dia != d.Dia).Select(o => o.Uso.CustoUsd).ToList();
            var media = outros.Average();
            if (d.Uso.CustoUsd < ForaDaCurvaCustoMinimo || d.Uso.CustoUsd <= media * ForaDaCurvaVezes) continue;
            var dica = new Dica("DIA_FORA_DA_CURVA", "Dia fora da curva",
                $"Em {d.Dia:dd/MM} o uso custou ≈ US$ {d.Uso.CustoUsd:0.00}, mais de {ForaDaCurvaVezes:0}× a média dos outros dias (≈ US$ {media:0.00}). " +
                "Vale olhar o que rodou nesse dia no histórico de sessões.",
                null, null, Economia(d.Uso.CustoUsd - media));
            if (pior is null || dica.EconomiaUsd > pior.EconomiaUsd) pior = dica;
        }
        return pior;
    }

    private static bool ModeloCaro(string? modelo)
        => modelo is not null && ModelosCaros.Any(m => modelo.Contains(m, StringComparison.OrdinalIgnoreCase));

    private static decimal Economia(decimal valor) => Math.Round(Math.Max(0m, valor), 2);

    private static string Curto(string sessaoId) => sessaoId.Length <= 8 ? sessaoId : sessaoId[..8];

    /// <summary>Início da janela: os últimos 7 dias, contando hoje (dia de Brasília).</summary>
    public static DateOnly PrimeiroDia(DateTimeOffset agora) => FusoBrasil.DataLocal(agora).AddDays(-(Dias - 1));
}
