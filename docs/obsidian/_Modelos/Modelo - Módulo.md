---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo {{title}}

O que o módulo resolve, em uma frase. Voltar: [[00 - Dashboard]] · Receita: [[Receita - Novo Módulo (API + App)]]

| Camada | Onde |
|---|---|
| API | `src/Modules/<Nome>/AgentDesk.Modules.<Nome>` |
| App | `src/AgentDesk.Web/src/app/features/<nome>` |
| Tabelas | `...` |
| Testes | `tests/AgentDesk.IntegrationTests/<Nome>` · `e2e/<nome>.spec.ts` |

## Regras de negócio
- ...

## Endpoints
| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/...` | perfil | 200 · 404 `<Nome>.NaoEncontrado` |

## Telas
- ...

## Pendências
- [ ] ...

Criado em {{date}}.
