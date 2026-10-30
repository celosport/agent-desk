---
tags: [modulo, exemplo]
status: exemplo
---
# ✅ Módulo Tarefas (exemplo)

CRUD completo e comentado para **copiar** ao criar um módulo — [[Receita - Novo Módulo (API + App)]].
Remova quando o primeiro módulo real existir (API, app, tabela, testes, mock e esta nota). Voltar: [[00 - Dashboard]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Tarefas/AgentDesk.Modules.Tarefas` |
| App | `src/AgentDesk.Web/src/app/features/tarefas` |
| Tabelas | `tarefas` |
| Testes | `tests/AgentDesk.IntegrationTests/Tarefas` · `tarefas.store.spec.ts` · `e2e/tarefas.spec.ts` |

## Endpoints
| Método | Rota | Resposta |
|---|---|---|
| GET | `/api/v1/tarefas?status=PENDENTE` | 200 `TarefaDto[]` |
| POST | `/api/v1/tarefas` `{ titulo }` | 201 `TarefaDto` · 400 |
| PUT | `/api/v1/tarefas/{id}/concluir` | 200 · 404 `Tarefas.NaoEncontrada` · 409 `Tarefas.JaConcluida` |

`TarefaDto = { tarefaId, titulo, status: "PENDENTE" | "CONCLUIDA", criadaEm, concluidaEm? }`

## O que ele demonstra
- API: slice por caso de uso, update condicional contra corrida, erro de negócio com `code` estável, dono do dado pelo token.
- App: `models/api/store` com signals, tela `OnPush`, erro decidido pelo `code` (`Tarefas.JaConcluida` → recarrega), mock e E2E.
