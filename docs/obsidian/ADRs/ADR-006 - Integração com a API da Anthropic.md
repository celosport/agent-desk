---
tags: [adr]
---
# ADR-006 — Integração com a API da Anthropic

- **Status:** aceita
- **Data:** 2026-10-30

## Contexto
Dois módulos falam com a API da Claude: **Configuracoes** (testar a chave) e **Automacoes** (rodar os fluxos). Um módulo não pode
referenciar outro, e a chamada **nunca** sai do navegador. Os testes não podem fazer chamada real nem usar chave real.

## Decisão
- Contrato `IClienteAnthropic` no **SharedKernel** (`Integracoes/Anthropic`), implementado em **AgentDesk.Infrastructure**
  (`Integracoes/ClienteAnthropic.cs`) com `HttpClient` tipado. É o mesmo padrão do `IGeradorToken`: integração externa fica na
  infraestrutura, o módulo só conhece o contrato.
- HTTP direto (o pedido do produto foi "HttpClient com a chave do usuário"), com `x-api-key` por requisição e
  `anthropic-version: 2026-10-21`. URL base e versão vêm da configuração (`Anthropic:UrlBase`, `Anthropic:Versao`).
- Testar a chave = `GET /v1/models?limit=1`: valida a chave **sem gastar tokens**.
- Erros da Anthropic viram `Error` com código estável: `Anthropic.ChaveInvalida` (401/403 → 422),
  `Anthropic.LimiteDeTaxa` (429 → 503) e `Anthropic.Indisponivel` (5xx/529/timeout/rede → 503). Foi criado o `ErrorType.Unavailable` (503).
- Nos testes de integração, o `HttpMessageHandler` primário é trocado por `AnthropicFalso` (responde pelo final da chave). Assim
  serialização, headers e tradução de erro são testados de verdade, sem rede.
- Os modelos usados nunca ficam no código: vêm da tabela `modelos_claude` ([[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]).

## Alternativas consideradas
- SDK oficial `Anthropic` para .NET: dá tipos prontos, mas esconde o HTTP que o produto pediu para controlar e complica o
  falso por chave. Fica como opção se precisarmos de streaming ou tool use.
- Cliente dentro de cada módulo: duplicaria código e tradução de erros.

## Consequências
- ✅ Um único ponto para timeout, log (com `x-api-key` redigido) e tradução de erros.
- ✅ Testes determinísticos e gratuitos.
- ⚠️ Campos novos da API (ex.: `stop_reason: "refusal"`) precisam ser mapeados à mão em `ClienteAnthropic`.

Relacionados: [[00 - Dashboard]] · [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]] · [[ADR-001 - Monolito Modular]]
