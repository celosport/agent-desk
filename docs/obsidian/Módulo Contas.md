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
| Tabelas | `usuarios` (inclui `foto`, `foto_tipo`, `foto_versao`) |
| Testes | `tests/AgentDesk.IntegrationTests/Contas` · `core/auth/*.spec.ts` · `e2e/conta.spec.ts` |

## Endpoints
| Método | Rota | Acesso | Resposta |
|---|---|---|---|
| POST | `/api/v1/auth/cadastro` | anônimo (rate limit) | 201 `SessaoDto` · 400 · 409 `Auth.EmailEmUso` |
| POST | `/api/v1/auth/login` | anônimo (rate limit) | 200 `SessaoDto` · 401 |
| GET | `/api/v1/auth/eu` | logado | `{ usuarioId, perfil }` |
| GET | `/api/v1/conta/perfil` | logado | `UsuarioDto` (nome, e-mail, perfil, `fotoUrl`) |
| PUT | `/api/v1/conta/perfil` | logado | altera o nome · 400 |
| POST | `/api/v1/conta/foto` | logado | multipart `arquivo` (PNG/JPEG/WEBP até 1 MB, conferido pelo conteúdo) · 422 `Conta.FotoInvalida`/`Conta.FotoGrande` |
| DELETE | `/api/v1/conta/foto` | logado | remove a foto |
| GET | `/api/v1/usuarios/{id}/foto` | anônimo (`<img>` não manda token) | imagem com cache longo; o `?v=` muda a cada troca |

`SessaoDto = { accessToken, tokenType: "Bearer", expiraEm, usuario: { usuarioId, nome, email, perfil, fotoUrl? } }`

## No app
- `AuthStore` guarda a sessão no `localStorage` (`agentdesk.sessao`); `authInterceptor` manda o Bearer e encerra a sessão em 401.
- Guards: `autenticadoGuard`, `anonimoGuard`, `perfilGuard(...)`; área inicial por perfil em `rotaInicial()`.
- Perfis: `USUARIO`, `ADMIN` — novos perfis seguem [[Perguntas para Novo Projeto]] §2.

## Foto de perfil (Fase 8)
- O app recorta a foto no aparelho (`features/perfil/ui/cortador-foto`: arrastar, zoom e girar, quadro redondo → JPEG 512 px); o servidor só valida pelo conteúdo e guarda no banco (`BYTEA`, sem volume/S3).
- Avatar no topo (`shared/ui/avatar`) leva ao `/perfil`; sem foto, mostra as iniciais. Mesma solução do Zena.

## Pendências comuns (se o produto pedir)
- "Esqueci minha senha" (e-mail) e convite por link (próximas fases), excluir conta (LGPD/lojas).
