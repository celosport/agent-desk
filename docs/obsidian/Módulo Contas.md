---
tags: [modulo]
status: pronto
---
# 🔐 Módulo Contas

Cadastro, login e identidade do usuário. Voltar: [[00 - Dashboard]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Contas/AgentDesk.Modules.Contas` |
| App | `src/AgentDesk.Web/src/app/features/auth` + `core/auth` |
| Tabelas | `usuarios` |
| Testes | `tests/AgentDesk.IntegrationTests/Contas` · `core/auth/*.spec.ts` · `e2e/conta.spec.ts` |

## Endpoints
| Método | Rota | Acesso | Resposta |
|---|---|---|---|
| POST | `/api/v1/auth/cadastro` | anônimo (rate limit) | 201 `SessaoDto` · 400 · 409 `Auth.EmailEmUso` |
| POST | `/api/v1/auth/login` | anônimo (rate limit) | 200 `SessaoDto` · 401 |
| GET | `/api/v1/auth/eu` | logado | `{ usuarioId, perfil }` |

`SessaoDto = { accessToken, tokenType: "Bearer", expiraEm, usuario: { usuarioId, nome, email, perfil } }`

## No app
- `AuthStore` guarda a sessão no `localStorage` (`agentdesk.sessao`); `authInterceptor` manda o Bearer e encerra a sessão em 401.
- Guards: `autenticadoGuard`, `anonimoGuard`, `perfilGuard(...)`; área inicial por perfil em `rotaInicial()`.
- Perfis: `USUARIO`, `ADMIN` — novos perfis seguem [[Perguntas para Novo Projeto]] §2.

## Pendências comuns (se o produto pedir)
- "Esqueci minha senha" (e-mail), convite por link, foto de perfil, excluir conta (LGPD/lojas).
