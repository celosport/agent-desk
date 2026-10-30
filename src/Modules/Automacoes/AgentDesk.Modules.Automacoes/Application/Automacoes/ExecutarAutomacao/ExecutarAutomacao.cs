using System.Text;
using FluentValidation;
using AgentDesk.Modules.Automacoes.Application.DTOs;
using AgentDesk.Modules.Automacoes.Domain;
using AgentDesk.SharedKernel.Contratos;
using AgentDesk.SharedKernel.Integracoes;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;
using AgentDesk.SharedKernel.Tempo;

namespace AgentDesk.Modules.Automacoes.Application.Automacoes.ExecutarAutomacao;

/// <summary>
/// Roda a automação na Claude com a chave do usuário (do servidor, nunca do navegador) e grava o consumo.
/// Modelo: o do pedido → o da automação → o padrão do usuário. O limite mensal é conferido ANTES da chamada.
/// </summary>
public sealed record ExecutarAutomacaoCommand(Guid UsuarioId, Guid AutomacaoId, string? Entrada, string? ModeloId, string? NomeArquivo)
    : ICommand<ExecucaoDto>;

internal sealed class ExecutarAutomacaoValidator : AbstractValidator<ExecutarAutomacaoCommand>
{
    public const int TamanhoMaximoBytes = 200 * 1024;

    public ExecutarAutomacaoValidator()
    {
        RuleFor(x => x.Entrada).Cascade(CascadeMode.Stop)
            .Must(e => !string.IsNullOrWhiteSpace(e)).WithMessage("Cole um texto ou envie um arquivo .txt/.md.")
            .Must(e => Encoding.UTF8.GetByteCount(e!) <= TamanhoMaximoBytes).WithMessage("A entrada tem no máximo 200 KB.");
        RuleFor(x => x.ModeloId).MaximumLength(80);
        RuleFor(x => x.NomeArquivo).MaximumLength(200)
            .Must(n => n is null || n.EndsWith(".txt", StringComparison.OrdinalIgnoreCase) || n.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Só arquivos .txt ou .md.");
    }
}

internal sealed class ExecutarAutomacaoHandler(
    IAutomacoesRepository automacoes,
    IConfiguracoesDeUso configuracoes,
    IRegistroConsumo consumo,
    IClienteAnthropic anthropic,
    TimeProvider clock) : ICommandHandler<ExecutarAutomacaoCommand, ExecucaoDto>
{
    /// <summary>A partir de quanto do limite a resposta traz o alerta.</summary>
    private const decimal PercentualAlerta = 80m;

    public async Task<Result<ExecucaoDto>> Handle(ExecutarAutomacaoCommand command, CancellationToken cancellationToken)
    {
        var automacao = await automacoes.ObterAsync(command.AutomacaoId, cancellationToken);
        if (automacao is not { Ativa: true }) return AutomacaoErros.NaoEncontrada;

        var preferencias = await configuracoes.ObterPreferenciasAsync(command.UsuarioId, cancellationToken);
        if (preferencias.ChaveApi is null) return AutomacaoErros.ChaveNaoConfigurada;

        var modeloId = Vazio(command.ModeloId) ?? automacao.ModeloId ?? preferencias.ModeloPadraoId;
        if (modeloId is null) return AutomacaoErros.ModeloNaoDefinido;
        var preco = await configuracoes.ObterModeloAsync(modeloId, cancellationToken);
        if (preco is not { Ativo: true }) return AutomacaoErros.ModeloInvalido;

        var agora = clock.GetUtcNow();
        var (inicioMes, fimMes) = FusoBrasil.Mes(agora);
        var gastoAntes = preferencias.LimiteMensalUsd is null
            ? 0m
            : await consumo.GastoNoPeriodoAsync(command.UsuarioId, inicioMes, fimMes, cancellationToken);
        if (preferencias.LimiteMensalUsd is { } limite && preferencias.BloquearAoAtingirLimite && gastoAntes >= limite)
            return AutomacaoErros.LimiteMensalAtingido(gastoAntes, limite);

        // A partir daqui a Anthropic pode cobrar: se o navegador desistir no meio, a chamada segue e o consumo é gravado
        // mesmo assim (por isso CancellationToken.None).
        var pedido = new PedidoMensagem(modeloId, automacao.MaxTokens, automacao.PromptSistema,
            automacao.MontarMensagem(command.Entrada!), preco.FallbackRecusa);
        var inicio = clock.GetTimestamp();
        var resposta = await anthropic.EnviarMensagemAsync(preferencias.ChaveApi, pedido, CancellationToken.None);
        var duracaoMs = (int)clock.GetElapsedTime(inicio).TotalMilliseconds;

        var chamada = new ChamadaClaude(Guid.NewGuid(), command.UsuarioId, automacao.AutomacaoId, automacao.Nome, modeloId, null,
            UsoTokens.Zero, preco, 0m, duracaoMs, StatusChamada.Erro, null, null, Vazio(command.NomeArquivo), null, agora);

        if (resposta.IsFailure)
        {
            await consumo.RegistrarAsync(chamada with { ErroCodigo = resposta.Error.Code }, CancellationToken.None);
            return resposta.Error;
        }

        var r = resposta.Value;
        // Com fallback, quem respondeu pode ser outro modelo: cobra pelo preço dele (se estiver na tabela)
        var precoUsado = r.Modelo == modeloId ? preco : await configuracoes.ObterModeloAsync(r.Modelo, CancellationToken.None) ?? preco;
        var custo = precoUsado.CustoDe(r.Uso);
        chamada = chamada with { ModeloUsado = r.Modelo, Uso = r.Uso, Preco = precoUsado, CustoUsd = custo, MotivoParada = r.MotivoParada };

        if (r.Recusada)
        {
            await consumo.RegistrarAsync(chamada with { Status = StatusChamada.Recusada, ErroCodigo = AutomacaoErros.Recusada.Code },
                CancellationToken.None);
            return AutomacaoErros.Recusada;
        }

        await consumo.RegistrarAsync(chamada with { Status = StatusChamada.Sucesso, Resultado = r.Texto }, CancellationToken.None);

        return new ExecucaoDto(chamada.ChamadaId, automacao.AutomacaoId, automacao.Codigo, modeloId, r.Modelo, r.Texto, r.Truncada,
            TokensDto.De(r.Uso), custo, duracaoMs, agora, Alerta(gastoAntes + custo, preferencias.LimiteMensalUsd));
    }

    private static AlertaLimiteDto? Alerta(decimal gastoMes, decimal? limite)
    {
        if (limite is not { } l) return null;
        var percentual = Math.Round(gastoMes / l * 100m, 1);
        return percentual < PercentualAlerta ? null : new AlertaLimiteDto(gastoMes, l, percentual, gastoMes >= l);
    }

    private static string? Vazio(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();
}
