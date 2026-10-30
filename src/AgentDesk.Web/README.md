# AgentDesk.Web — frontend (Angular 22 PWA)

Esqueleto do app. Documentação completa no cofre do Obsidian: `docs/obsidian/Frontend (Angular PWA).md`.

## Rodar

Requer **Node.js 22.22.3+ ou 24.15+** (exigência do Angular 22).

| Como | Comando | Observação |
|---|---|---|
| **Junto com a API** (recomendado) | F5 no Visual Studio, perfil **"AgentDesk (API + App)"**, ou `dotnet run --project src/Host/AgentDesk.API` | O SPA Proxy roda `npm run start:com-api`, instala as dependências na 1ª vez e abre http://localhost:4210 |
| Só o app, sem backend | `npm run start:mock` | API falsa em memória (`core/mock`). Senha livre; e-mail com "admin" entra como ADMIN |
| Só o app, contra a API já no ar | `npm start` | API em https://localhost:52480 |

```bash
npm test               # unitários (Vitest)
npm run e2e            # ponta a ponta (Playwright) sobre o build e2e (produção + service worker + mock)
npm run build          # produção (dist/agentdesk-web) — o Dockerfile copia para o wwwroot da API
```
1ª vez no E2E: `npx playwright install chromium`.

## Estrutura

```
src/app/
├─ core/        singletons sem tela: auth (AuthStore, interceptor, guards), config (API_BASE_URL), http (problem+json),
│               mock (API falsa), ui (Avisos), tema, atualizacao (PWA "nova versão"), tempo-real (polling)
├─ shared/      UI "burra" (inputs/outputs) e funções puras (formatos pt-BR)
└─ features/    uma pasta por área, lazy: auth, shell, inicio, tarefas (EXEMPLO: copie para criar a sua)
   └─ <feature>/data-access/   models (= DTOs da API), *.api.ts (URLs), *.store.ts (signals)
```

Regras: `features → core/shared` (nunca o contrário); features não importam outras features; a tela só chama a store/api da
própria feature; erro da API decidido pelo `code` do problem+json; todo endpoint novo ganha resposta no mock e um E2E.
