using AgentDesk.Modules.Sessoes.Application.Ingestao;
using AgentDesk.Modules.Sessoes.Application.Painel;
using AgentDesk.Modules.Sessoes.Application.Sessoes;
using AgentDesk.Modules.Sessoes.Application.Tokens;
using AgentDesk.Modules.Sessoes.Domain;
using AgentDesk.Modules.Sessoes.Infrastructure.Repositories;
using AgentDesk.SharedKernel;
using AgentDesk.SharedKernel.Messaging;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentDesk.Modules.Sessoes;

/// <summary>
/// Sessões do Claude Code ao vivo (tabelas 8): tokens de ingestão, eventos dos hooks, telemetria OTLP (tokens e custo) e a
/// rotina que apaga a linha do tempo com mais de 90 dias. [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
/// </summary>
public sealed class SessoesModule : IModule
{
    public string Nome => "Sessoes";

    public IServiceCollection RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ITokensRepository, TokensRepository>();
        services.AddScoped<ISessoesRepository, SessoesRepository>();
        services.AddScoped<ISessoesConsultas, SessoesConsultasRepository>();

        services.AddScoped<IValidator<CriarTokenCommand>, CriarTokenValidator>();
        services.AddScoped<IValidator<IngerirEventoCommand>, IngerirEventoValidator>();

        services.AddCommandHandler<CriarTokenCommand, TokenCriadoDto, CriarTokenHandler>();
        services.AddQueryHandler<ListarTokensQuery, IReadOnlyList<TokenIngestaoDto>, ListarTokensHandler>();
        services.AddCommandHandler<RevogarTokenCommand, bool, RevogarTokenHandler>();
        services.AddCommandHandler<IngerirEventoCommand, bool, IngerirEventoHandler>();
        services.AddCommandHandler<IngerirTelemetriaCommand, int, IngerirTelemetriaHandler>();
        services.AddQueryHandler<ObterAoVivoQuery, AoVivoDto, ObterAoVivoHandler>();
        services.AddQueryHandler<ObterPainelQuery, PainelClaudeCodeDto, ObterPainelHandler>();

        // Rotina diária de limpeza; nos testes fica desligada (Sessoes__RotinaLimpezaHabilitada=false)
        services.AddSingleton<LimpezaEventosRotina>();
        if (configuration.GetValue("Sessoes:RotinaLimpezaHabilitada", true))
            services.AddHostedService(sp => sp.GetRequiredService<LimpezaEventosRotina>());

        return services;
    }
}
