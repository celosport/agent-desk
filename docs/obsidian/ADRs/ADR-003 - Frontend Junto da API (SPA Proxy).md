---
tags: [adr, frontend]
---
# ADR-003 — Frontend junto da API (SPA Proxy em dev, wwwroot em produção)

- **Status:** aceita

## Contexto
Backend e app vivem no mesmo repositório. Subir os dois separados (dois terminais, duas portas, lembrar o `npm install`) atrasa
o dia a dia e confunde quem chega. Em produção queremos **um serviço só** no Railway, sem CORS e com HTTPS na mesma origem.

## Decisão
- **Desenvolvimento:** o perfil **"AgentDesk (API + App)"** do `launchSettings.json` liga o `Microsoft.AspNetCore.SpaProxy`
  (`ASPNETCORE_HOSTINGSTARTUPASSEMBLIES`). O `.csproj` define `SpaRoot=..\..\AgentDesk.Web\`, `SpaProxyLaunchCommand=npm run start:com-api`
  e `SpaProxyServerUrl=http://localhost:4210`. F5 / `dotnet run` sobe a API e o `ng serve`; o navegador vai para o app.
- `scripts/iniciar-com-api.mjs` (sem dependências) confere a versão do Node, procura um Node compatível no PC se o do PATH for antigo,
  roda `npm install` na 1ª vez e, se algo falhar, **mantém a janela aberta com o motivo**.
- Target `GarantirDependenciasDoApp` no `.csproj`: no 1º build Debug, roda `npm install` se faltar `node_modules` (pula em `CI=true`).
- Perfil **"somente API"** continua existindo (Swagger). Testes de integração e produção não carregam o SPA Proxy.
- **Produção:** o `Dockerfile` compila o Angular e copia o build para `wwwroot`. O `Program.cs` serve os arquivos com cache por hash
  (`CacheDoApp`) e faz fallback SPA para `index.html`, mantendo `/api/**` inexistente como 404 problem+json.

## Alternativas consideradas
- Dois processos manuais (API e `ng serve`) — mais passos, fácil esquecer um.
- `proxy.conf.json` do Angular apontando para a API — resolve CORS em dev, mas a API não sobe o app.
- Front em serviço separado (Vercel/Netlify) — dois deploys, CORS e duas origens para gerenciar.

## Consequências
- ✅ Um F5 sobe tudo; quem chega no projeto roda sem ler manual.
- ✅ Um deploy, uma origem, sem CORS em produção.
- ⚠️ Exige Node instalado na máquina de quem roda a API em Debug (sem Node, só avisa e a API sobe sozinha).
- ⚠️ Mudou a porta da API? Atualize `launchSettings.json`, `environment.development.ts` e `scripts/iniciar-com-api.mjs`.

Relacionados: [[Frontend (Angular PWA)]] · [[Ambiente Local (API + App)]] · [[Deploy (Railway)]]
