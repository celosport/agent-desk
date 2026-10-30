using System.Xml.Linq;
using Dapper;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace AgentDesk.Infrastructure.Seguranca;

/// <summary>
/// Guarda o anel de chaves do Data Protection na tabela <c>chaves_protecao_dados</c>: sobrevive a deploys (o disco do Railway some)
/// e é o mesmo para todas as instâncias. [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]]
/// A interface do ASP.NET é síncrona; a leitura acontece poucas vezes (o anel fica em cache na memória).
/// </summary>
internal sealed class RepositorioChavesPostgres(NpgsqlDataSource dataSource) : IXmlRepository
{
    public IReadOnlyCollection<XElement> GetAllElements()
    {
        using var conexao = dataSource.OpenConnection();
        return conexao.Query<string>("SELECT xml FROM chaves_protecao_dados ORDER BY criada_em;")
            .Select(XElement.Parse)
            .ToList();
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        const string sql = """
            INSERT INTO chaves_protecao_dados (nome, xml) VALUES (@Nome, @Xml)
            ON CONFLICT (nome) DO NOTHING;
            """;
        using var conexao = dataSource.OpenConnection();
        conexao.Execute(sql, new { Nome = friendlyName, Xml = element.ToString(SaveOptions.DisableFormatting) });
    }
}

internal static class ProtecaoDadosExtensions
{
    /// <summary>Nome fixo: todas as instâncias (e deploys novos) leem as mesmas chaves.</summary>
    public const string NomeAplicacao = "AgentDesk";

    public static IServiceCollection AddProtecaoDadosNoBanco(this IServiceCollection services)
    {
        services.AddDataProtection().SetApplicationName(NomeAplicacao);
        services.AddSingleton<IConfigureOptions<KeyManagementOptions>>(sp => new ConfigureOptions<KeyManagementOptions>(
            o => o.XmlRepository = new RepositorioChavesPostgres(sp.GetRequiredService<NpgsqlDataSource>())));
        return services;
    }
}
