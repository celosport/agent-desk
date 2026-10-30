---
tags: [deploy]
---
# 🚀 Deploy (Railway)

Voltar: [[00 - Dashboard]] · Imagem única (API + app): `Dockerfile` · CI: `.github/workflows/ci.yml`

## Modelo
Um **serviço por ambiente**, cada um seguindo uma branch do GitHub, e um **banco PostgreSQL por ambiente**.

| Ambiente | Branch | Banco | Seed |
|---|---|---|---|
| Desenvolvimento | `developer` | `db-<app>-developer` | `Banco__AplicarSeed=true` |
| Produção | `main` ou `producao` (protegida: PR + CI verde) | `db-<app>-producao` | **sempre `false`** |

Habilite "**Wait for CI**" nos serviços: o deploy só sobe com os testes verdes.

## Variáveis do serviço
| Variável | Valor |
|---|---|
| `ConnectionStrings__AgentDeskDb` | `Host=${{db.PGHOST}};Port=${{db.PGPORT}};Database=${{db.PGDATABASE}};Username=${{db.PGUSER}};Password=${{db.PGPASSWORD}}` (rede privada) |
| `Jwt__ChaveSecreta` | ≥ 32 bytes aleatórios (um por ambiente) |
| `Banco__AplicarScripts` | `true` (a API aplica o `schema.sql` ao subir, em segundo plano) |
| `Banco__AplicarSeed` | `true` só em desenvolvimento |
| `PORT` | `8080` (o domínio público aponta para a porta 8080) |

## Checklist antes de publicar
1. CI verde na branch.
2. **Backup do banco** se o `schema.sql` apaga ou altera tabelas.
3. Conferir os "Deploy Logs": procure `Banco: falha ao aplicar os scripts` (a API continua no ar, mas o banco não migrou).
4. Primeiro acesso: criar a conta e promover a ADMIN, se existir área administrativa (`database/manutencao/promover-admin.sql`).

## Quando o deploy "não sobe"
- **Healthcheck falhou:** veja os logs de subida. O `/health` responde antes do schema, então falha de healthcheck costuma ser porta errada (`PORT`) ou variável faltando.
- **Railway fora do ar** (status.railway.com): builds pausados; o site segue na versão anterior. Espere e faça *Redeploy* depois.
- **502 "Application failed to respond"**: confira a porta do domínio (Settings → Networking → deve ser 8080).

## O app (frontend) no deploy
- O `Dockerfile` compila o Angular (`ng build`) e copia `dist/agentdesk-web/browser` para o `wwwroot` da API: **um serviço só**, mesma origem, sem CORS.
- Rota sem arquivo (`/tarefas`) cai no `index.html` (fallback SPA); `/api/...` inexistente continua 404 em problem+json.
- Depois do deploy, quem está com o app aberto vê **"Nova versão disponível — Atualizar"** ([[Frontend (Angular PWA)]]).
