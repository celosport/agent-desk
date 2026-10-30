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
  · [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]] · [[ADR-006 - Integração com a API da Anthropic]] · [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]
  · [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]] · [[ADR-009 - Escritório em Canvas 2D com Motor Puro]] · [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
- 🔁 Migração de sistemas legados → [[Migração do Base44]]
- 🧱 Modelos de nota → `_Modelos/` (Ctrl/Cmd+P → "Inserir modelo")

## 🧩 Módulos
| Módulo | Backend | Frontend | Tabelas | Status |
|---|---|---|---|---|
| [[Módulo Contas]] | `src/Modules/Contas` | `features/auth` | `usuarios` | 🟢 cadastro, login, `GET /auth/eu` |
| [[Módulo Configuracoes]] | `src/Modules/Configuracoes` | `features/configuracoes` | `configuracoes_usuario`, `modelos_claude`, `chaves_protecao_dados` | 🟡 Fase 1: API key cifrada, modelo padrão, limite, tabela de preços |
| [[Módulo Automacoes]] | `src/Modules/Automacoes` | `features/automacoes` | `automacoes` | 🟡 Fase 2: 3 fluxos chamando a Claude, edição pelo ADMIN |
| [[Módulo Sessoes]] | `src/Modules/Sessoes` | `features/escritorio` (sala Claude Code) · `features/configuracoes` (conectar) | `tokens_ingestao`, `cc_sessoes`, `cc_eventos`, `cc_consumo_diario` | 🟢 Fase 5: sessões do Claude Code ao vivo (hooks + telemetria) |
| [[Escritório Animado]] | — (usa Automacoes) | `features/escritorio` | — | 🟢 Fase 4: sala isométrica em Canvas, robôs por automação |
| [[Módulo Consumo]] | `src/Modules/Consumo` | `features/consumo` | `consumo_chamadas` | 🟢 Fase 3: painel (polling 10 s), gráfico por dia, ranking e histórico |

> Ao criar um módulo: acrescente uma linha aqui e uma nota a partir de `_Modelos/Modelo - Módulo`.

## 📜 Histórico
| Data | O que mudou |
|---|---|
| 2026-10-30 | Projeto criado a partir do esqueleto |
| 2026-10-30 | Perguntas respondidas; ADR-005 a 007; **Fase 1**: módulo Configuracoes + tabela de modelos e preços |
| 2026-10-30 | **Fase 5**: sessões reais do Claude Code no Escritório (coletor local, hooks assíncronos, telemetria OTLP, tokens de ingestão), ADR-010 |
| 2026-10-30 | **Fase 4**: Escritório animado (Canvas 2D, motor puro, balões com tokens e custo, movimento reduzido), ADR-009 |
| 2026-10-30 | **Fase 3**: painel de consumo (hoje, mês, acumulado, gráfico SVG, ranking, limite) e histórico com filtros; contrato `IDiretorioUsuarios` |
| 2026-10-30 | **Fase 2**: módulos Automacoes e Consumo (registro), fallback de recusa, ADR-008; exemplo Tarefas removido |
