---
tags: [frontend, padroes]
---
# 📱 Frontend (Angular PWA)

App em `src/AgentDesk.Web` — Angular 22, standalone, **signals**, `OnPush`, PWA com service worker.
Voltar: [[00 - Dashboard]] · Rodar: [[Ambiente Local (API + App)]] · Decisão: [[ADR-003 - Frontend Junto da API (SPA Proxy)]]

## Estrutura
```
src/app/
├─ core/            singletons sem tela
│  ├─ auth/         AuthStore (signals + localStorage), authInterceptor (Bearer, 401 → sair), guards
│  ├─ config/       API_BASE_URL (InjectionToken; vazio = mesma origem)
│  ├─ http/         problem+json → mensagem (mensagemDeErro) e code (codigoDeErro)
│  ├─ mock/         API falsa em memória (start:mock e E2E)
│  ├─ ui/           Avisos (toasts com aria-live)
│  ├─ tema/         claro/escuro/automático
│  ├─ atualizacao/  PWA: "Nova versão disponível — Atualizar"
│  └─ tempo-real/   atualizarPeriodicamente (polling com pausa e recuo)
├─ shared/          UI "burra" (EstadoVazio, AlternarTema) e funções puras (formatos pt-BR)
└─ features/        uma pasta por área, lazy-loaded
   ├─ auth/ shell/ inicio/
   └─ tarefas/      EXEMPLO completo: data-access/{models, api, store} + página
```

## Regras (não quebrar)
1. `features → core/shared`, nunca o contrário. **Feature não importa outra feature.**
2. Componentes standalone com `ChangeDetectionStrategy.OnPush`; estado em **stores com signals** (`*.store.ts`), escopo da rota.
3. **A tela nunca monta URL**: só a `*.api.ts` da feature conhece os endpoints. Models = DTOs da API (mesmos nomes do JSON).
4. Erro da API: decidir pelo **`code`** do problem+json (`Automacoes.LimiteMensalAtingido`), mostrar o **texto do servidor** (`mensagemDeErro`).
5. Rotas protegidas por guards: `autenticadoGuard`, `anonimoGuard`, `perfilGuard('ADMIN')`; área inicial por perfil em `rotaInicial()`.
6. Acessibilidade = testabilidade: rótulos (`<label for>`), `aria-label` em botões só com ícone; E2E localiza por papel e rótulo.
7. Datas: a API manda UTC; a tela formata com `shared/util/formatos.ts` (fuso America/Sao_Paulo).
8. **Todo endpoint novo** ganha resposta no `core/mock/mock-api.interceptor.ts` (mesmo JSON e mesmos `code`) e um teste E2E.

## Design tokens
Em `src/styles.scss`: `--ui-*` (cores por tema, espaços `--ui-e1..6`, raios, tipografia) e classes `ui-botao`, `ui-campo`, `ui-entrada`, `ui-cartao`, `ui-pagina`.
Troque a marca em `--ui-marca` (e `theme_color` no `public/manifest.webmanifest`). Ícones em `public/icons`.

## Integração com a API
| Ambiente | `apiBaseUrl` | Como o app chega na API |
|---|---|---|
| Desenvolvimento (`npm start` / F5) | `https://localhost:52480` | CORS liberado para `http://localhost:4210` |
| Mock (`start:mock`, E2E) | `''` | `mockApiInterceptor` responde em memória |
| Produção | `''` (mesma origem) | A API serve o build em `wwwroot` (Dockerfile) com fallback SPA |

## PWA
- `ngsw-config.json`: o app inteiro em cache (abre offline); `/api`, `/swagger` e `/health` ficam fora da navegação do SW.
- A versão nova só vale depois de recarregar → `AtualizacaoApp` mostra o aviso "Atualizar" (nunca recarrega sozinho).
- Cache HTTP na API: arquivos com hash = 1 ano; `index.html`/`ngsw.json` = `no-cache` (`CacheDoApp` no `Program.cs`).

## Opcionais (decididos em [[Perguntas para Novo Projeto]])
- **Offline-first**: fila de sincronização (IndexedDB) + API idempotente (id gerado no cliente, `ON CONFLICT DO NOTHING`).
- **Plano pago**: item de menu com selo "Pro" + tela de convite quando a API responde `403 Planos.RecursoExclusivoPro`.
- **App nas lojas**: Capacitor (Android/iOS) sobre o mesmo build; `environment.app.ts` com a URL da API e CORS para `capacitor://localhost`.

## Testes
- **Unitários (Vitest)**: regras puras, stores, guards, interceptors — `npm test`.
- **E2E (Playwright)**: fluxos no computador e no celular sobre o build `e2e` (produção + SW + mock) — `npm run e2e`.
- Fluxo longo instável em paralelo? Rode o teste isolado antes de concluir que quebrou.
- CI: `.github/workflows/ci.yml` (jobs `frontend` e `e2e`).
