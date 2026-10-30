---
tags: [painel]
---
# 🧭 Agent Desk — Dashboard

> [!info] O que é
> Painel de consumo e automações com a API da Claude, com escritório animado dos agentes
> Monólito modular **.NET 8 + Dapper + PostgreSQL 16** com app **Angular 22 PWA** no mesmo repositório.
> Subir a API (F5) **já sobe o app** — [[ADR-003 - Frontend Junto da API (SPA Proxy)]].

> [!todo] Projeto novo? Comece aqui
> 1. Responda **[[Perguntas para Novo Projeto]]** (o script `novo-projeto.sh` já preenche o básico).
> 2. Siga [[Ambiente Local (API + App)]] para rodar tudo.
> 3. Crie o primeiro módulo com a [[Receita - Novo Módulo (API + App)]].

## 🗺️ Mapa
- 📐 Padrões → [[Arquitetura e Padrões]] (backend) · [[Frontend (Angular PWA)]] (app)
- 🧩 Receita → [[Receita - Novo Módulo (API + App)]]
- 🐳 Ambiente → [[Ambiente Local (API + App)]] · [[Deploy (Railway)]]
- 🏛️ Decisões → [[ADR-001 - Monolito Modular]] · [[ADR-002 - Handlers Próprios (CQRS sem MediatR)]] · [[ADR-003 - Frontend Junto da API (SPA Proxy)]] · [[ADR-004 - Documentação no Obsidian]]
- 🔁 Migração de sistemas legados → [[Migração do Base44]]
- 🧱 Modelos de nota → `_Modelos/` (Ctrl/Cmd+P → "Inserir modelo")

## 🧩 Módulos
| Módulo | Backend | Frontend | Tabelas | Status |
|---|---|---|---|---|
| [[Módulo Contas]] | `src/Modules/Contas` | `features/auth` | `usuarios` | 🟢 cadastro, login, `GET /auth/eu` |
| [[Módulo Tarefas (exemplo)]] | `src/Modules/Tarefas` | `features/tarefas` | `tarefas` | 🟢 exemplo de CRUD — copie e depois remova |

> Ao criar um módulo: acrescente uma linha aqui e uma nota a partir de `_Modelos/Modelo - Módulo`.

## 📜 Histórico
| Data | O que mudou |
|---|---|
| 2026-10-30 | Projeto criado a partir do esqueleto |
