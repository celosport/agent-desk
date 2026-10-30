using AgentDesk.Modules.Configuracoes.Domain;
using AgentDesk.SharedKernel.Contratos;

namespace AgentDesk.Modules.Configuracoes.Application.Contratos;

/// <summary>
/// O que o módulo Configuracoes oferece aos outros (contrato no SharedKernel): a chave decifrada, o modelo padrão, o limite
/// e o preço de um modelo. Quem chama nunca vê o texto cifrado nem a tabela.
/// </summary>
internal sealed class ConfiguracoesDeUso(IConfiguracoesRepository configuracoes, IModelosRepository modelos, ICofreChaves cofre)
    : IConfiguracoesDeUso
{
    public async Task<PreferenciasDeUso> ObterPreferenciasAsync(Guid usuarioId, CancellationToken cancellationToken)
    {
        var c = await configuracoes.ObterAsync(usuarioId, cancellationToken) ?? ConfiguracaoUsuario.Padrao(usuarioId);
        return new PreferenciasDeUso(cofre.TentarDecifrar(c.ChaveApiCifrada), c.ModeloPadraoId, c.LimiteMensalUsd, c.BloquearAoAtingirLimite);
    }

    public async Task<PrecoModelo?> ObterModeloAsync(string modeloId, CancellationToken cancellationToken)
    {
        var m = await modelos.ObterAsync(modeloId, cancellationToken);
        return m is null
            ? null
            : new PrecoModelo(m.ModeloId, m.NomeExibicao, m.PrecoEntradaMTok, m.PrecoSaidaMTok, m.PrecoCacheLeituraMTok,
                m.PrecoCacheEscritaMTok, m.Ativo, m.FallbackRecusa);
    }
}
