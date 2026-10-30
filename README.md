# AgentDesk

Esqueleto padrão: monólito modular **.NET 8 + Dapper + PostgreSQL 16** + app **Angular 22 PWA**, com documentação em cofre do **Obsidian**.
Regras: [CLAUDE.md](CLAUDE.md) · Documentação: abra `docs/obsidian` no Obsidian (entrada: `00 - Dashboard.md`).

## Criar um projeto a partir daqui
```bash
./scripts/novo-projeto.sh            # Git Bash no Windows; faz as perguntas-chave e cria o projeto em outra pasta
```
O script troca `AgentDesk` pelo nome do projeto, aplica nome de exibição, descrição, cor e portas, e registra as demais respostas
em `docs/obsidian/Perguntas para Novo Projeto.md` e no `CLAUDE.md` para o Claude Code aplicar na primeira sessão.

## Rodar local
```bash
docker compose up -d                        # PostgreSQL já com o schema (+ pgAdmin :5050, Mailpit :8025)
dotnet run --project src/Host/AgentDesk.API    # API (https://localhost:52480) E o app (http://localhost:4210) juntos
```
No Visual Studio: perfil **"AgentDesk (API + App)"** + F5. Só a API: perfil "AgentDesk.API (somente API)" (abre o Swagger).
Só o app, sem backend: `cd src/AgentDesk.Web && npm run start:mock`. Detalhes: `docs/obsidian/Ambiente Local (API + App).md`.

Testes: `dotnet test` (backend) · `cd src/AgentDesk.Web && npm test && npm run e2e` (app).

## O que já vem pronto
| Peça | Onde |
|---|---|
| Núcleo: `Result/Error`, CQRS leve + validação, `IModule`, HTTP `problem+json` | `src/BuildingBlocks/AgentDesk.SharedKernel` |
| Npgsql + Dapper + health check + JWT | `src/BuildingBlocks/AgentDesk.Infrastructure` |
| Host: módulos, rate limit, CORS, Swagger, proxy reverso, schema no deploy sem travar o `/health`, **SPA Proxy** e fallback do app | `src/Host/AgentDesk.API` |
| Módulo **Contas**: cadastro, login e `GET /auth/eu` | `src/Modules/Contas` |
| Módulos **Configuracoes**, **Automacoes** e **Consumo** (Configuracoes é a referência para copiar) | `src/Modules/*` |
| **App Angular PWA**: login/cadastro, guards por perfil, tema claro/escuro, aviso de nova versão, mock de API, features Configurações e Automações | `src/AgentDesk.Web` |
| Testes: integração (API + PostgreSQL reais), Vitest e Playwright | `tests/`, `src/AgentDesk.Web` |
| Docker (API + app numa imagem), Railway, CI no GitHub Actions | `Dockerfile`, `railway.json`, `.github/workflows/ci.yml` |
| Cofre Obsidian: Dashboard, padrões, receitas, ADRs, modelos e perguntas-chave | `docs/obsidian` |

## Criar um módulo novo
Siga `docs/obsidian/Receita - Novo Módulo (API + App).md` (banco → API → testes → app → mock/E2E → nota).

## Deploy
`docs/obsidian/Deploy (Railway).md` (um serviço por branch; a imagem já leva o app em `wwwroot`).
