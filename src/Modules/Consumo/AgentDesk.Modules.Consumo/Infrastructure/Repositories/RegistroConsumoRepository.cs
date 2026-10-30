using Dapper;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Texto;

namespace AgentDesk.Modules.Consumo.Infrastructure.Repositories;

/// <summary>
/// Grava cada chamada à Claude em <c>consumo_chamadas</c> (contrato <see cref="IRegistroConsumo"/> usado pelo módulo Automacoes).
/// Os preços da época vão junto: mudar a tabela de modelos não altera o histórico. [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]
/// </summary>
internal sealed class RegistroConsumoRepository(IDbConnectionFactory connectionFactory) : IRegistroConsumo
{
    public async Task RegistrarAsync(ChamadaClaude c, CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO consumo_chamadas (
                chamada_id, usuario_id, automacao_id, automacao_nome, modelo_id, modelo_usado,
                tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita,
                preco_entrada_mtok, preco_saida_mtok, preco_cache_leitura_mtok, preco_cache_escrita_mtok,
                custo_usd, duracao_ms, status, erro_codigo, motivo_parada, nome_arquivo, resultado, iniciada_em)
            VALUES (
                @ChamadaId, @UsuarioId, @AutomacaoId, @AutomacaoNome, @ModeloId, @ModeloUsado,
                @TokensEntrada, @TokensSaida, @TokensCacheLeitura, @TokensCacheEscrita,
                @PrecoEntrada, @PrecoSaida, @PrecoCacheLeitura, @PrecoCacheEscrita,
                @CustoUsd, @DuracaoMs, @Status, @ErroCodigo, @MotivoParada, @NomeArquivo, @Resultado, @IniciadaEm);
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            c.ChamadaId, c.UsuarioId, c.AutomacaoId, c.AutomacaoNome, c.ModeloId, c.ModeloUsado,
            TokensEntrada = c.Uso.Entrada, TokensSaida = c.Uso.Saida,
            TokensCacheLeitura = c.Uso.CacheLeitura, TokensCacheEscrita = c.Uso.CacheEscrita,
            PrecoEntrada = c.Preco?.EntradaMTok, PrecoSaida = c.Preco?.SaidaMTok,
            PrecoCacheLeitura = c.Preco?.CacheLeituraMTok, PrecoCacheEscrita = c.Preco?.CacheEscritaMTok,
            c.CustoUsd, c.DuracaoMs, Status = c.Status.ToTexto(), c.ErroCodigo, c.MotivoParada, c.NomeArquivo, c.Resultado,
            IniciadaEm = c.IniciadaEm.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }

    public async Task<decimal> GastoNoPeriodoAsync(Guid usuarioId, DateTimeOffset de, DateTimeOffset ate, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT COALESCE(SUM(custo_usd), 0) FROM consumo_chamadas
             WHERE usuario_id = @UsuarioId AND iniciada_em >= @De AND iniciada_em < @Ate;
            """;
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteScalarAsync<decimal>(new CommandDefinition(sql, new
        {
            UsuarioId = usuarioId, De = de.ToUniversalTime(), Ate = ate.ToUniversalTime(),
        }, cancellationToken: cancellationToken));
    }
}
