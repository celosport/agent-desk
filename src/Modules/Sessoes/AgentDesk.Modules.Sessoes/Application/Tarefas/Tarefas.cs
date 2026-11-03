using FluentValidation;
using AgentDesk.Modules.Sessoes.Application.Ingestao;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.SharedKernel.Messaging;
using AgentDesk.SharedKernel.Results;

namespace AgentDesk.Modules.Sessoes.Application.Tarefas;

// Mandar tarefa pelo app para o Claude Code do PC. O app (JWT) cria e acompanha; o coletor do PC (token de ingestão) busca e informa o
// resultado. Só roda em pasta que o usuário liberou NO PC. [[ADR-018 - Mandar Tarefa para o Claude Code do PC]]

public sealed record PastaDto(string ProjetoChave, string Projeto);

/// <summary>Um computador com o coletor ouvindo (ou que já ouviu): <c>Online</c> = deu sinal nos últimos 45 s.</summary>
public sealed record ComputadorDto(string Maquina, bool Online, IReadOnlyList<PastaDto> Pastas);

/// <summary><c>TarefaId</c> é também o id da sessão do Claude Code: o robô dela aparece no Escritório.</summary>
public sealed record TarefaDto(
    Guid TarefaId,
    string Maquina,
    string ProjetoChave,
    string Projeto,
    string Texto,
    StatusTarefa Status,
    DateTimeOffset CriadaEm,
    DateTimeOffset? IniciadaEm,
    DateTimeOffset? FinalizadaEm,
    string? Erro)
{
    internal static TarefaDto De(Tarefa t, DateTimeOffset agora)
        => new(t.TarefaId, t.Maquina, t.ProjetoChave, t.Projeto, t.Texto, RegrasTarefas.StatusVisto(t, agora), t.CriadaEm, t.IniciadaEm, t.FinalizadaEm, t.Erro);
}

// ---- lado do app (usuário logado) ----

public sealed record ObterComputadoresQuery(Guid UsuarioId) : IQuery<IReadOnlyList<ComputadorDto>>;

internal sealed class ObterComputadoresHandler(ITarefasRepository tarefas, TimeProvider clock) : IQueryHandler<ObterComputadoresQuery, IReadOnlyList<ComputadorDto>>
{
    public async Task<Result<IReadOnlyList<ComputadorDto>>> Handle(ObterComputadoresQuery query, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var pastas = await tarefas.ListarPastasAsync(query.UsuarioId, cancellationToken);
        IReadOnlyList<ComputadorDto> lista = pastas
            .GroupBy(p => p.Maquina)
            .Select(g => new ComputadorDto(g.Key, agora - g.Max(p => p.VistoEm) <= RegrasTarefas.JanelaOnline,
                g.Select(p => new PastaDto(p.ProjetoChave, p.Projeto)).ToList()))
            .ToList();
        return Result.Success(lista);
    }
}

public sealed record EnviarTarefaRequestDto(string? Maquina, string? ProjetoChave, string? Texto);

public sealed record EnviarTarefaCommand(Guid UsuarioId, string? Maquina, string? ProjetoChave, string? Texto) : ICommand<TarefaDto>;

internal sealed class EnviarTarefaValidator : AbstractValidator<EnviarTarefaCommand>
{
    public EnviarTarefaValidator()
    {
        RuleFor(x => x.Maquina).NotEmpty().MaximumLength(80).OverridePropertyName("maquina");
        RuleFor(x => x.ProjetoChave).NotEmpty().Length(12).OverridePropertyName("projetoChave");
        RuleFor(x => x.Texto).NotEmpty().MaximumLength(RegrasTarefas.TextoMaximo).OverridePropertyName("texto");
    }
}

internal sealed class EnviarTarefaHandler(ITarefasRepository tarefas, TimeProvider clock) : ICommandHandler<EnviarTarefaCommand, TarefaDto>
{
    public async Task<Result<TarefaDto>> Handle(EnviarTarefaCommand command, CancellationToken cancellationToken)
    {
        var maquina = command.Maquina!.Trim();
        var projeto = await tarefas.NomeDaPastaAsync(command.UsuarioId, maquina, command.ProjetoChave!, cancellationToken);
        if (projeto is null) return TarefaErros.PastaNaoLiberada;

        var agora = clock.GetUtcNow();
        var tarefa = new Tarefa(Guid.NewGuid(), maquina, command.ProjetoChave!, projeto, command.Texto!.Trim(), StatusTarefa.Pendente, agora, null, null, null);
        if (!await tarefas.CriarAsync(command.UsuarioId, tarefa, RegrasTarefas.MaximoAbertas, cancellationToken)) return TarefaErros.LimiteDeTarefas;
        return TarefaDto.De(tarefa, agora);
    }
}

public sealed record ListarTarefasQuery(Guid UsuarioId) : IQuery<IReadOnlyList<TarefaDto>>;

internal sealed class ListarTarefasHandler(ITarefasRepository tarefas, TimeProvider clock) : IQueryHandler<ListarTarefasQuery, IReadOnlyList<TarefaDto>>
{
    public const int Quantas = 20;

    public async Task<Result<IReadOnlyList<TarefaDto>>> Handle(ListarTarefasQuery query, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        IReadOnlyList<TarefaDto> lista = (await tarefas.ListarAsync(query.UsuarioId, Quantas, cancellationToken)).Select(t => TarefaDto.De(t, agora)).ToList();
        return Result.Success(lista);
    }
}

/// <summary>Cancela uma tarefa que ainda não começou. Depois de começar, quem interrompe é o Parar do robô (mesmo id da sessão).</summary>
public sealed record CancelarTarefaCommand(Guid UsuarioId, Guid TarefaId) : ICommand<bool>;

internal sealed class CancelarTarefaHandler(ITarefasRepository tarefas, TimeProvider clock) : ICommandHandler<CancelarTarefaCommand, bool>
{
    public async Task<Result<bool>> Handle(CancelarTarefaCommand command, CancellationToken cancellationToken)
    {
        if (await tarefas.CancelarPendenteAsync(command.UsuarioId, command.TarefaId, clock.GetUtcNow(), cancellationToken)) return true;
        return await tarefas.ObterAsync(command.UsuarioId, command.TarefaId, cancellationToken) is null ? TarefaErros.TarefaNaoEncontrada : TarefaErros.TarefaJaIniciada;
    }
}

// ---- lado do coletor (token de ingestão) ----

public sealed record PastaRequestDto(string? ProjetoChave, string? Projeto);

public sealed record InformarPastasRequestDto(string? Maquina, IReadOnlyList<PastaRequestDto>? Pastas);

/// <summary>O coletor informa quais pastas o usuário liberou no PC (a cada ~20 s: serve também de sinal de "online").</summary>
public sealed record InformarPastasCommand(string? Token, InformarPastasRequestDto Corpo) : ICommand<bool>;

internal sealed class InformarPastasValidator : AbstractValidator<InformarPastasCommand>
{
    public InformarPastasValidator()
    {
        RuleFor(x => x.Corpo.Maquina).NotEmpty().MaximumLength(80).OverridePropertyName("maquina");
        RuleFor(x => x.Corpo.Pastas).NotNull().Must(p => p is null || p.Count <= RegrasTarefas.PastasPorComputador)
            .WithMessage($"No máximo {RegrasTarefas.PastasPorComputador} pastas por computador.").OverridePropertyName("pastas");
        RuleForEach(x => x.Corpo.Pastas).ChildRules(p =>
        {
            p.RuleFor(x => x.ProjetoChave).NotEmpty().Length(12).OverridePropertyName("projetoChave");
            p.RuleFor(x => x.Projeto).NotEmpty().MaximumLength(120).OverridePropertyName("projeto");
        }).OverridePropertyName("pastas");
    }
}

internal sealed class InformarPastasHandler(ITokensRepository tokens, ITarefasRepository tarefas, TimeProvider clock) : ICommandHandler<InformarPastasCommand, bool>
{
    public async Task<Result<bool>> Handle(InformarPastasCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;

        var pastas = command.Corpo.Pastas!.DistinctBy(p => p.ProjetoChave).Select(p => new PastaLiberada(p.ProjetoChave!, p.Projeto!.Trim())).ToList();
        await tarefas.SubstituirPastasAsync(usuarioId.Value, command.Corpo.Maquina!.Trim(), pastas, agora, cancellationToken);
        return true;
    }
}

/// <summary>O que o coletor precisa para rodar: o id (= <c>--session-id</c>), a pasta (pela chave) e o texto da tarefa.</summary>
public sealed record TarefaParaExecutarDto(Guid TarefaId, string ProjetoChave, string Texto);

/// <summary>O coletor busca tarefas pendentes do computador dele. Cada tarefa sai uma vez só (já fica EM_ANDAMENTO).</summary>
public sealed record ReceberTarefasCommand(string? Token, string? Maquina, int? Limite) : ICommand<IReadOnlyList<TarefaParaExecutarDto>>;

internal sealed class ReceberTarefasHandler(ITokensRepository tokens, ITarefasRepository tarefas, TimeProvider clock)
    : ICommandHandler<ReceberTarefasCommand, IReadOnlyList<TarefaParaExecutarDto>>
{
    public async Task<Result<IReadOnlyList<TarefaParaExecutarDto>>> Handle(ReceberTarefasCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;

        IReadOnlyList<TarefaParaExecutarDto> nenhuma = [];
        if (string.IsNullOrWhiteSpace(command.Maquina) || command.Maquina.Length > 80) return Result.Success(nenhuma);

        var maquina = command.Maquina.Trim();
        await tarefas.RegistrarSinalAsync(usuarioId.Value, maquina, agora, cancellationToken);
        var limite = Math.Clamp(command.Limite ?? RegrasTarefas.MaximoPorBusca, 0, RegrasTarefas.MaximoPorBusca);
        if (limite == 0) return Result.Success(nenhuma);

        var tarefasDeHoje = await tarefas.ReivindicarAsync(usuarioId.Value, maquina, limite, agora - RegrasTarefas.ValidadePendente, agora, cancellationToken);
        IReadOnlyList<TarefaParaExecutarDto> lista = tarefasDeHoje.Select(t => new TarefaParaExecutarDto(t.TarefaId, t.ProjetoChave, t.Texto)).ToList();
        return Result.Success(lista);
    }
}

/// <param name="Status">"CONCLUIDA" ou "FALHOU".</param>
public sealed record ResultadoTarefaRequestDto(string? Maquina, string? Status, string? Erro);

public sealed record ResultadoTarefaCommand(string? Token, Guid TarefaId, ResultadoTarefaRequestDto Corpo) : ICommand<bool>;

internal sealed class ResultadoTarefaValidator : AbstractValidator<ResultadoTarefaCommand>
{
    public ResultadoTarefaValidator()
    {
        RuleFor(x => x.Corpo.Maquina).NotEmpty().MaximumLength(80).OverridePropertyName("maquina");
        RuleFor(x => x.Corpo.Status).Must(s => s is "CONCLUIDA" or "FALHOU").WithMessage("Status inválido: use CONCLUIDA ou FALHOU.").OverridePropertyName("status");
        RuleFor(x => x.Corpo.Erro).MaximumLength(300).OverridePropertyName("erro");
    }
}

internal sealed class ResultadoTarefaHandler(ITokensRepository tokens, ITarefasRepository tarefas, TimeProvider clock) : ICommandHandler<ResultadoTarefaCommand, bool>
{
    public async Task<Result<bool>> Handle(ResultadoTarefaCommand command, CancellationToken cancellationToken)
    {
        var agora = clock.GetUtcNow();
        var usuarioId = await Autenticacao.UsuarioDoTokenAsync(tokens, command.Token, agora, cancellationToken);
        if (usuarioId is null) return SessaoErros.TokenInvalido;

        var status = command.Corpo.Status == "CONCLUIDA" ? StatusTarefa.Concluida : StatusTarefa.Falhou;
        var erro = string.IsNullOrWhiteSpace(command.Corpo.Erro) ? null : command.Corpo.Erro.Trim();
        return await tarefas.FinalizarAsync(usuarioId.Value, command.Corpo.Maquina!.Trim(), command.TarefaId, status, erro, agora, cancellationToken)
            ? true
            : TarefaErros.TarefaNaoEncontrada;
    }
}
