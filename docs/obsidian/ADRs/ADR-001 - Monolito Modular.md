---
tags: [adr]
---
# ADR-001 — Monólito modular

- **Status:** aceita

## Contexto
Equipe pequena, um produto, necessidade de entregar rápido sem a complexidade operacional de microsserviços — mas sem virar uma "bola de lama".

## Decisão
Um único deploy e um único banco, com **módulos isolados** (um projeto por módulo). Cada módulo tem `Domain/`, `Application/`, `Infrastructure/` e `Endpoints/`. Um módulo referencia apenas o `SharedKernel`; **nunca outro módulo**. Comunicação entre módulos por interfaces no `SharedKernel`, implementadas pelo módulo dono. O Host (`AgentDesk.API`) é o único que conhece todos e os registra numa lista explícita (`ModuleExtensions`).

## Alternativas consideradas
- Microsserviços: custo de infraestrutura e de consistência sem necessidade.
- Camadas globais (Controllers/Services/Repositories): espalha cada funcionalidade por todo o código.

## Consequências
- ✅ Deploy simples, transações simples, fronteiras claras.
- ✅ Um módulo pode virar serviço depois, porque só fala por contratos.
- ⚠️ Disciplina: a regra "módulo não referencia módulo" vale mais que o conforto.

Relacionados: [[Arquitetura e Padrões]] · [[ADR-002 - Handlers Próprios (CQRS sem MediatR)]]
