---
tags: [receita]
---
# 🧩 Receita — Novo Módulo (API + App)

Do banco à tela, no mesmo commit. Exemplo de referência: **Configuracoes** (API em `src/Modules/Configuracoes`, app em `features/configuracoes`).
Precisa de dados de outro módulo? Contrato em `SharedKernel/Contratos`, implementado pelo dono — ver [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]].
Voltar: [[00 - Dashboard]] · Padrões: [[Arquitetura e Padrões]] · [[Frontend (Angular PWA)]]

## 1. Banco
- [ ] Tabela em `database/schema.sql` (idempotente: `CREATE TABLE IF NOT EXISTS`, constraints em `DO $$`). Dados de demo em `seed.sql`.

## 2. API (`src/Modules/<Nome>/AgentDesk.Modules.<Nome>`)
- [ ] Copie o módulo `Configuracoes`, renomeie projeto, namespaces e `<Nome>Module`.
- [ ] `Domain/` (agregado `internal sealed record`, `<Nome>Erros` com códigos `"<Nome>.Motivo"`, `I<Nome>Repository`).
- [ ] `Infrastructure/` (Dapper: SQL em raw string, parâmetros nomeados, `CommandDefinition` com `CancellationToken`).
- [ ] `Application/` (um slice por caso de uso: Command/Query + Validator + Handler) e `DTOs/` públicos.
- [ ] `Endpoints/` (controller enxuto, `[Authorize(Roles = ...)]`, usuário via `IUsuarioAtual`).
- [ ] Registre em `ModuleExtensions.cs`, `AgentDesk.API.csproj` (ProjectReference) e `AgentDesk.slnx`.
- [ ] Testes em `tests/AgentDesk.IntegrationTests/<Nome>/`: feliz, 400, 404/403, 409 e **isolamento entre usuários**.

## 3. App (`src/AgentDesk.Web/src/app/features/<nome>`)
- [ ] Copie `features/tarefas` e renomeie.
- [ ] `data-access/<nome>.models.ts` = DTOs da API (mesmos nomes do JSON; enums em `SNAKE_CASE_UPPER`).
- [ ] `data-access/<nome>.api.ts` = único lugar com as URLs.
- [ ] `data-access/<nome>.store.ts` = signals + tradução de erro pelo `code`; teste `*.store.spec.ts`.
- [ ] Página `<nome>.page.ts` (standalone, `OnPush`, `providers: [<Nome>Store]`).
- [ ] Rota lazy em `app.routes.ts` (dentro do shell; `perfilGuard(...)` se for restrita) e item no menu do `shell.component.ts`.
- [ ] Respostas no `core/mock/mock-api.interceptor.ts` (mesmo JSON e `code`) + E2E em `e2e/<nome>.spec.ts`.

## 4. Documentação (Obsidian)
- [ ] Nota `Módulo <Nome>` a partir de `_Modelos/Modelo - Módulo` e linha na tabela do [[00 - Dashboard]].
- [ ] ADR se houve decisão relevante (`_Modelos/Modelo - ADR`).

## 5. Conferir antes do commit
```bash
dotnet test                                   # backend
cd src/AgentDesk.Web && npm test && npm run e2e  # app
```
