---
tags: [ambiente]
---
# 🐳 Ambiente Local (API + App)

Voltar: [[00 - Dashboard]] · Decisão: [[ADR-003 - Frontend Junto da API (SPA Proxy)]]

## Pré-requisitos
- **.NET SDK 8** (a `.slnx` pede SDK ≥ 9.0.200 para abrir a solução inteira; com o 8, compile pelos projetos).
- **Node.js 22.22.3+ ou 24.15+** (Angular 22). Windows: `winget install OpenJS.NodeJS.LTS`.
- **Docker Desktop** (PostgreSQL, pgAdmin e Mailpit; também usado pelos testes de integração).
- Certificado de desenvolvimento: `dotnet dev-certs https --trust` (uma vez por máquina).

## Subir tudo
```bash
docker compose up -d                          # PostgreSQL :5434 (já com schema e seed) · pgAdmin :5050 · Mailpit :8025
dotnet run --project src/Host/AgentDesk.API      # API + App juntos
```
No **Visual Studio**: escolha o perfil **"AgentDesk (API + App)"** e aperte **F5**.

O que acontece:
1. No 1º build (Debug), se faltar `src/AgentDesk.Web/node_modules`, o `.csproj` roda `npm install` (sem Node só avisa).
2. A API sobe em https://localhost:52480 e o **SPA Proxy** roda `npm run start:com-api` numa janela própria.
3. `scripts/iniciar-com-api.mjs` confere o Node (o do Visual Studio costuma ser antigo; ele procura outro no PC), e sobe o `ng serve` em http://localhost:4210.
4. O navegador abre na API, que redireciona para o app quando ele fica pronto. Se algo falhar, a janela do app **fica aberta mostrando o motivo**; a API segue funcionando.

| Endereço | O quê |
|---|---|
| http://localhost:4210 | App Angular (recarrega ao salvar) |
| https://localhost:52480/swagger | Swagger da API |
| https://localhost:52480/health | Health check |
| http://localhost:5050 | pgAdmin |
| http://localhost:8025 | Mailpit (e-mails de teste) |

Perfil **"AgentDesk.API (somente API)"**: sobe só a API e abre o Swagger.

## Outras formas
| Quero… | Comando |
|---|---|
| Só o app, sem backend | `cd src/AgentDesk.Web && npm run start:mock` |
| Só o app, com a API já no ar | `cd src/AgentDesk.Web && npm start` |
| Testes do backend | `dotnet test` |
| Testes do app | `cd src/AgentDesk.Web && npm test && npm run e2e` |
| Recriar o banco do zero | `docker compose down -v && docker compose up -d` |

## Problemas comuns
- **"Couldn't start the SPA development server"** → olhe a janela do app (Node antigo, `npm install` falhou, porta 4200 ocupada).
- **CORS** no navegador → a origem do app precisa estar em `Cors:Origins` do `appsettings.Development.json`.
- **Certificado inválido** nas chamadas do app para a API → `dotnet dev-certs https --trust` e reabra o navegador.
- **Porta ocupada** por outro projeto do esqueleto → mude as portas (pergunta do `novo-projeto.sh`).
