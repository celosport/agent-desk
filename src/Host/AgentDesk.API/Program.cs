using System.Text.Json;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using AgentDesk.API;
using AgentDesk.Infrastructure;
using AgentDesk.Infrastructure.Auth;
using AgentDesk.SharedKernel.Identidade;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.OpenApi.Models;

// =============================================================================
// AgentDesk.API — Composition Root (ver docs/obsidian/Arquitetura e Padrões.md) · [[ADR-001 - Monolito Modular]]
// =============================================================================

var builder = WebApplication.CreateBuilder(args);

// ---- Acesso a dados: NpgsqlDataSource + IDbConnectionFactory + Dapper ----
builder.Services.AddInfrastructure(builder.Configuration);

// ---- Autenticação JWT — toda rota exige token, salvo [AllowAnonymous] ----
builder.Services.AddAutenticacaoJwt(builder.Configuration);

// ---- Módulos do monólito (serviços + controllers) e contrato JSON ----
builder.Services.AddModules(builder.Configuration).AddJsonOptions(o =>
{
    // camelCase, enums como texto ("EM_ANDAMENTO"), nulos omitidos
    o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper));
    o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// ---- Rate limiting: protege login e cadastro contra força bruta ----
var limiteAuthPorMinuto = builder.Configuration.GetValue("RateLimit:AutenticacaoPorMinuto", 10);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(PoliticasRateLimit.Autenticacao, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = limiteAuthPorMinuto, Window = TimeSpan.FromMinutes(1) }));
});

// Railway (e qualquer proxy reverso): o IP real do visitante vem em X-Forwarded-For. Sem isto, todos dividiriam
// o mesmo limite do rate limiting. Um salto só: vale a entrada que o proxy da plataforma acrescentou.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.ForwardLimit = 1;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "AgentDesk API", Version = "v1" });
    c.CustomSchemaIds(t => t.FullName); // evita colisão de DTOs com o mesmo nome entre módulos

    var bearer = new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Token obtido em POST /api/v1/auth/login",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
    };
    c.AddSecurityDefinition("Bearer", bearer);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { [bearer] = Array.Empty<string>() });
});

// CORS: só em desenvolvimento (front em outra origem). Em produção o mesmo serviço entrega o front (mesma origem).
const string CorsApp = "CorsApp";
string[] origensDev = builder.Environment.IsDevelopment()
    ? builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? []
    : [];
builder.Services.AddCors(o => o.AddPolicy(CorsApp, p => p.WithOrigins(origensDev).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Nuvem (Railway): aplica os scripts do banco em segundo plano (a API já responde /health) — ver InicializacaoBanco.cs
InicializacaoBanco.AgendarAplicacao(app);

app.UseForwardedHeaders(); // primeiro: IP e esquema reais
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors(CorsApp);
app.UseHttpsRedirection();
// Produção (Railway): o mesmo serviço entrega o app Angular de wwwroot — mesma origem, sem CORS.
// Arquivos com hash no nome (main-AB12CD34.js) ficam em cache por 1 ano; index.html e o service worker, nunca.
// Em desenvolvimento o app roda no ng serve (http://localhost:4210) via SPA Proxy — [[ADR-003 - Frontend Junto da API (SPA Proxy)]].
app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = CacheDoApp.Aplicar });

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();

if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html")))
{
    // Rota de API inexistente continua sendo 404 em problem+json (e não a página do app)
    app.MapFallback("/api/{**rota}", () => Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Rota não encontrada."))
       .AllowAnonymous();
    // Qualquer outra rota sem arquivo (/tarefas, /inicio…) abre o app, que resolve a tela no navegador
    app.MapFallbackToFile("index.html", new StaticFileOptions { OnPrepareResponse = CacheDoApp.Aplicar })
       .AllowAnonymous();
}

app.Run();

// Necessário para WebApplicationFactory<Program> nos testes de integração
public partial class Program { }

/// <summary>Cache do app Angular: arquivo com hash = imutável por 1 ano; o resto (index.html, ngsw.json) sempre revalida.</summary>
internal static partial class CacheDoApp
{
    [GeneratedRegex(@"-[A-Za-z0-9_-]{8}\.(js|css)$")]
    private static partial Regex ArquivoComHash();

    public static void Aplicar(Microsoft.AspNetCore.StaticFiles.StaticFileResponseContext contexto)
        => contexto.Context.Response.Headers.CacheControl = ArquivoComHash().IsMatch(contexto.File.Name)
            ? "public, max-age=31536000, immutable"
            : "no-cache";
}
