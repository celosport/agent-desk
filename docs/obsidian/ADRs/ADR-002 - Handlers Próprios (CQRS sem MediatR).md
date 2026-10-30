---
tags: [adr]
---
# ADR-002 — CQRS leve com handlers próprios (sem MediatR)

- **Status:** aceita

## Decisão
`ICommand<T>`/`IQuery<T>` e `ICommandHandler`/`IQueryHandler` retornam `Result<T>`. Registro **explícito** no `IModule` (`AddCommandHandler` envolve o handler com o `ValidationCommandHandlerDecorator`, que executa os validators do FluentValidation antes do handler → fail-fast, HTTP 400 com os campos). Sem MediatR, sem reflection, sem pipeline mágico.

## Consequências
- ✅ Fácil de ler e de depurar (F12 vai direto ao handler).
- ✅ Nenhuma dependência extra.
- ⚠️ Comportamento transversal novo (log, métricas) = novo decorator registrado à mão.

Relacionados: [[Arquitetura e Padrões]] · [[ADR-001 - Monolito Modular]]
