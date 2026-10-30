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
- Automações = `POST /v1/messages` **sem streaming** (timeout de 120 s), sem `thinking` (o padrão dos modelos atuais já é adaptativo) e
  sem `temperature`/`top_p` (a versão `2026-10-21` recusa). Só os blocos `text` da resposta viram resultado; o `usage` vira o log.
- **Recusa do filtro de segurança** (`stop_reason: "refusal"`, HTTP 200): quando o modelo tem `fallback_recusa = true` na tabela, o
  pedido vai com `fallbacks: "default"` e o header `anthropic-beta: server-side-fallback-2026-07-01` — a Anthropic tenta de novo em
  outro modelo, e o custo usa o preço do modelo que **respondeu** (campo `model`). Recusa final = status `RECUSADA` no log, com os
  tokens cobrados. A carga inicial liga o fallback no Fable 5.1, Opus 5.5 e Sonnet 5.5 (o Haiku 5.5 não tem fallback no servidor).
- `stop_reason: "max_tokens"` = resposta marcada como **truncada** na tela.
- Erros da Anthropic viram `Error` com código estável: `Anthropic.ChaveInvalida` (401 → 422),
  `Anthropic.SemCredito` (402/403 → 422), `Anthropic.PedidoInvalido` (400/404/413 → 422, com a mensagem da Anthropic resumida),
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
- ⚠️ Campos novos da API precisam ser mapeados à mão em `ClienteAnthropic`.
- ⚠️ Com fallback, tentativas recusadas antes da resposta final (`usage.iterations`) não entram no custo estimado; a fatura oficial
  é a do Console da Anthropic.

Relacionados: [[00 - Dashboard]] · [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]] · [[ADR-001 - Monolito Modular]]
