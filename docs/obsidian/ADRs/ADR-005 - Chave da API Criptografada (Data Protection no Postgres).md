---
tags: [adr]
---
# ADR-005 — Chave da API criptografada (Data Protection no Postgres)

- **Status:** aceita
- **Data:** 2026-10-30

## Contexto
Cada usuário cadastra a **própria** API key da Anthropic. Ela dá acesso a gastar dinheiro em nome dele: não pode ir para o navegador
depois de salva, não pode aparecer em log e não pode ficar legível no banco. No Railway o disco do contêiner some a cada deploy,
então o anel de chaves do Data Protection (que, por padrão, fica no disco) seria perdido e as API keys salvas ficariam ilegíveis.

## Decisão
- A chave é cifrada com o **ASP.NET Core Data Protection** (`IDataProtectionProvider`, propósito `AgentDesk.Configuracoes.ChaveAnthropic.v1`)
  e gravada em `configuracoes_usuario.chave_api_cifrada`. Só os **4 últimos caracteres** ficam em claro (`chave_api_final`) para a tela
  mostrar `sk-ant-...abcd`.
- Nenhum endpoint devolve a chave. `GET /api/v1/configuracoes` devolve `chaveApiConfigurada` e `chaveApiMascarada`.
- O anel de chaves do Data Protection fica no **PostgreSQL** (tabela `chaves_protecao_dados`), por um `IXmlRepository` em
  `AgentDesk.Infrastructure/Seguranca/RepositorioChavesPostgres.cs`. Nome da aplicação fixo (`SetApplicationName("AgentDesk")`):
  várias instâncias e deploys novos leem as mesmas chaves.
- O header `x-api-key` é **redigido** no log do `HttpClient`. A chave decifrada só existe em memória durante a chamada.

## Alternativas consideradas
- Chave em variável de ambiente (uma só para todos): contraria a decisão "cada usuário tem a sua".
- Anel de chaves em disco/volume: perdido a cada deploy no Railway, e não é compartilhado entre instâncias.
- Azure Key Vault/KMS para proteger o anel: mais seguro, mas é infra e custo extra que ainda não temos. Pode entrar depois com
  `ProtectKeysWith...` sem mudar o módulo.

## Consequências
- ✅ A chave nunca volta para o navegador nem aparece no log; um vazamento só da tabela `configuracoes_usuario` não expõe chaves.
- ✅ Deploys e várias instâncias continuam lendo as chaves salvas.
- ⚠️ O anel fica **no mesmo banco**, sem proteção extra: quem tiver acesso total ao banco (ou a um backup) consegue decifrar.
  Trate o backup do banco como segredo. Para endurecer: proteger o anel com certificado/KMS.
- ⚠️ **Apagar `chaves_protecao_dados` = todas as chaves salvas viram lixo** (o usuário precisa cadastrar de novo).
  A tela trata isso: chave que não decifra é mostrada como "não configurada".

Relacionados: [[00 - Dashboard]] · [[Módulo Configuracoes]] · [[ADR-006 - Integração com a API da Anthropic]]
