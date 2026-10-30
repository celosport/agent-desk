---
tags: [backend, padroes]
---
# 📐 Arquitetura e Padrões

Guia único de como este projeto é construído. Reúne as decisões e as lições aprendidas em projetos em produção.
Resumo para o dia a dia: `CLAUDE.md` na raiz. Voltar: [[00 - Dashboard]] · Decisões: [[ADR-001 - Monolito Modular]] · [[ADR-002 - Handlers Próprios (CQRS sem MediatR)]]

## 1. Visão geral
**Monólito modular**: um deploy, um banco, módulos isolados. Cresce por módulos novos, não por camadas globais.

```
src/
├─ AgentDesk.Web                        App Angular PWA → [[Frontend (Angular PWA)]]
├─ Host/AgentDesk.API                    Composition Root (Program.cs, ModuleExtensions, InicializacaoBanco)
├─ BuildingBlocks/
│  ├─ AgentDesk.SharedKernel             IModule, Result/Error, handlers, contratos entre módulos, IUsuarioAtual
│  └─ AgentDesk.Infrastructure           Npgsql, Dapper, health check, JWT, TimeProvider
└─ Modules/<Nome>/AgentDesk.Modules.<Nome>/
   ├─ Domain/          agregados (records), erros, interfaces de repositório
   ├─ Application/     DTOs/ e <Agregado>/<CasoDeUso>/ (Command/Query + Validator + Handler)
   ├─ Infrastructure/  Repositories/ (Dapper)
   └─ Endpoints/       controllers
tests/AgentDesk.IntegrationTests         WebApplicationFactory<Program> + PostgreSQL real
database/                              schema.sql (idempotente), seed.sql, manutencao/*.sql
```
Regra de dependência: **módulo → SharedKernel**. Módulo nunca referencia outro módulo nem o Npgsql.

## 2. Vertical slice (um caso de uso)
Tudo do caso de uso fica junto em `Application/<Agregado>/<CasoDeUso>/`:
1. `Command`/`Query` (record público) + `Validator` (FluentValidation) + `Handler` (internal sealed).
2. O controller chama `ICommandHandler<,>`/`IQueryHandler<,>` e converte `Result` em HTTP.
3. O módulo registra tudo **explicitamente** (sem reflection):
```csharp
services.AddScoped<IValidator<CriarModeloCommand>, CriarModeloValidator>();
services.AddCommandHandler<CriarModeloCommand, ModeloDto, CriarModeloHandler>();   // com decorator de validação
services.AddQueryHandler<ListarModelosQuery, IReadOnlyList<ModeloDto>, ListarModelosHandler>();
```
Exemplo completo e comentado: módulo `Configuracoes` (o `Tarefas` do esqueleto foi removido na Fase 2).

## 3. Erros e HTTP
- Regra de negócio violada → `return Error.Conflict("Modulo.Codigo", "Mensagem em português");` (conversão implícita para `Result<T>`).
- Mapa: `Validation` 400 · `Unauthorized` 401 · `Forbidden` 403 · `NotFound` 404 · `Conflict` 409 · `Unprocessable` 422 · `Failure` 500.
- Resposta sempre `application/problem+json` com `code` estável (o front decide pelo `code`, não pelo texto). Validação traz `errors` por campo em camelCase.
- Exceção só para o inesperado. 500 nunca expõe `ex.Message`.
- Códigos no formato `Modulo.Motivo` e **nunca mudam** (são contrato).

## 4. Dados (Dapper + PostgreSQL)
- Repositório abre a conexão por operação: `await using var conn = await factory.OpenConnectionAsync(ct);`.
- SQL em raw string `const`, **parâmetros nomeados**, `CommandDefinition` com `CancellationToken`. Nunca concatenar.
- `DefaultTypeMap.MatchNamesWithUnderscores = true`: `automacao_id` ↔ `AutomacaoId`.
- Enum: coluna `VARCHAR` + `CHECK`; o repositório lê como `string` e usa `EnumTexto.Parse<T>()` / `.ToTexto()` (`SNAKE_CASE_UPPER`, igual ao JSON).
- Listas: `WHERE id = ANY(@Ids)` com **array** (o Npgsql não expande `IN @Ids`).
- Concorrência: prefira **update condicional** (`WHERE status = 'PENDENTE'`) e olhe as linhas afetadas, em vez de "consultar e depois gravar".
- Unicidade: deixe o **banco** decidir (índice único) e trate `DbException.SqlState` (`23505` → 409, `23503` → 422).
- Datas: `TimestampTz` sempre UTC; use `TimeProvider` (nunca `DateTime.Now`). `DateTimeOffset` com offset ≠ 0 **não grava** no Npgsql → `.ToUniversalTime()`.
- Idempotência de escrita vinda do celular/fila offline: o cliente envia um `id` gerado por ele e o `INSERT ... ON CONFLICT DO NOTHING` torna o reenvio inofensivo.

### Schema idempotente (`database/schema.sql`)
Roda a **cada deploy** e nos testes. Por isso:
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Constraint nova: `DO $$ BEGIN ALTER TABLE ... ADD CONSTRAINT ...; EXCEPTION WHEN duplicate_object THEN NULL; END $$;` (ou `DROP CONSTRAINT IF EXISTS` + `ADD`).
- Dados de uma vez só: `migracoes_dados (nome)` — `IF NOT EXISTS (SELECT 1 FROM migracoes_dados WHERE nome = 'v2_x')` ... `INSERT`.
- Seções por versão com cabeçalho (`-- v2 — o que mudou e por quê`), tudo dentro de `BEGIN; ... COMMIT;`.
- Apagar tabela/coluna é **sem volta**: avise, faça backup antes e confira se o código não usa mais.

## 5. Autenticação e autorização
- JWT Bearer HS256; `MapInboundClaims = false`; **FallbackPolicy = autenticado** (rota sem `[AllowAnonymous]` exige token).
- Controllers: `[Authorize(Roles = Perfis.X)]` + `IUsuarioAtual` (id vem do token).
- Chave secreta: `dotnet user-secrets` / variável `Jwt__ChaveSecreta` (≥ 32 bytes). **Nunca no Git.**
- Login/cadastro com `[EnableRateLimiting(PoliticasRateLimit.Autenticacao)]`. Mensagem igual para "e-mail não existe" e "senha errada".
- Senha: `PasswordHasher` do ASP.NET (PBKDF2). Nunca guardar senha em texto nem hash simples.
- Gate por plano/recurso: filtro de ação (`[ExigePlanoX]`) no SharedKernel que consulta um contrato (`IPlanoAcessoService`).

## 6. Receita: criar um módulo novo
1. Copie `src/Modules/Configuracoes/AgentDesk.Modules.Configuracoes` para `src/Modules/Novo/AgentDesk.Modules.Novo` e renomeie (projeto, namespaces, `NovoModule`).
2. Ajuste Domain (agregado, erros, `INovoRepository`) → Infrastructure (SQL) → Application (slices) → Endpoints.
3. Registre: `ModuleExtensions.cs` (lista de módulos), `AgentDesk.API.csproj` (ProjectReference), `AgentDesk.slnx`.
4. Tabelas novas no `database/schema.sql` (idempotente) e, se for demo, no `seed.sql`.
5. Testes de integração em `tests/AgentDesk.IntegrationTests/Novo/`. Cubra: caminho feliz, validação (400), não encontrado/sem permissão (404/403), conflito (409) e **isolamento entre usuários**.
6. Se outro módulo precisa de algo seu: crie a interface em `SharedKernel/<Tema>/` e implemente no seu módulo — o consumidor injeta só a interface.
7. Frontend: copie `features/tarefas` (ver [[Receita - Novo Módulo (API + App)]]).
8. Documente: nota do módulo (`_Modelos/Modelo - Módulo`), linha no [[00 - Dashboard]] e, se for decisão relevante, um ADR (`_Modelos/Modelo - ADR`).

## 7. Testes
- **Integração é o padrão**: API real + PostgreSQL real aplicando o `schema.sql` de verdade (pega erro de DDL e de SQL).
- Fábrica de testes: `AgentDeskApiFactory` (Testcontainers; ou `AGENTDESK_TESTES_BANCO` quando não há Docker).
- Cada teste cria os próprios dados (`ClienteNovoUsuarioAsync`) — sem depender de ordem nem de seed.
- Rotinas em segundo plano: variável `...__RotinaHabilitada=false` na fábrica; teste a classe da rotina diretamente.
- Relógio: injete `TimeProvider`; teste de horário não pode depender da hora em que roda (já tivemos teste que só falhava de manhã).
- A API omite campos nulos no JSON: no teste use `TryGetProperty`.
- Todo `try/catch` que engole erro precisa de um teste, senão a falha só aparece no log de produção.

## 8. Subida, deploy e operação
- `Dockerfile` de 3 estágios (app Angular → API → execução, com o app em `wwwroot`); Railway com `healthcheckPath=/health`. Detalhes: [[Deploy (Railway)]].
- **O `/health` responde antes de o schema terminar**: `InicializacaoBanco.AgendarAplicacao` roda em segundo plano, com `lock_timeout`, advisory lock e até 5 tentativas. Falha = uma linha clara no log, sem derrubar o processo.
- Log do Npgsql em `Warning` (senão o log da plataforma estoura o limite e esconde o erro real).
- Um serviço por branch (`developer` → dev, `producao`/`main` → produção). Branch de produção protegida: PR + CI verde.
- **Antes de um deploy que apaga/altera tabela: backup do banco.**
- Proxy reverso: `ForwardedHeaders` com um salto (IP real no rate limit).

## 9. Frontend
Ver [[Frontend (Angular PWA)]]: Angular standalone + signals, `core/shared/features`, mock de API para E2E. Sobe junto com a API: [[ADR-003 - Frontend Junto da API (SPA Proxy)]].

## 10. Lições aprendidas (leia antes de repetir o erro)
| Situação | O que aconteceu | Regra |
|---|---|---|
| Deploy caía no healthcheck | A API só respondia `/health` depois de aplicar o schema | Schema em segundo plano; `/health` imediato |
| Log da plataforma estourou | Log do Npgsql em `Information` escondeu o erro real | `Npgsql: Warning` no `appsettings.json` |
| Aviso das 9h sumia | `DateTimeOffset` em `-03:00` não grava no Npgsql; o `catch` engolia o erro | Sempre UTC; teste para todo `catch` que engole |
| Teste que só falhava de manhã | Dependia do horário real | `TimeProvider` e testes determinísticos |
| Código antigo quebrava o build | Arquivos apagados localmente não foram no commit | Conferir `git status` e rodar o build limpo antes do push |
| Senha de banco no Git | `appsettings.Development.json` com connection string real | Segredo só em `user-secrets`/variável; **girar a senha** se vazar |
| Tela antiga em produção (PWA) | O service worker guardava a versão velha | Aviso "Nova versão — Atualizar" no front |
| Teste de lógica de plano falhava | Teste usava usuário "Free" para recurso que virou Pro | Ao mudar uma regra, procure os testes que a assumem |
| Duas leituras do corpo HTTP | `ReadFromJsonAsync` fecha o stream | Ler como texto uma vez e fazer parse |
| Reembolso/cobrança | Regra de negócio em controller | Regra no handler/domínio, controller só traduz |
| Teste falhava só quando rodava depois de outro | Um teste editou um dado da carga inicial (preço do Haiku) e outro calculava o custo com ele | Teste que mexe em dado compartilhado (seed) restaura no `finally`; de preferência crie o seu próprio dado |
| E2E passava com o número errado | `hasText: '5 chamadas'` também casa com "15 chamadas" | Texto com número no E2E: regex ancorada (`/^\s*5 chamadas ·/`) |
| Toque no lugar errado no celular | Tabela larga (mesmo dentro de `overflow-x: auto`) e `<select>` com opções longas alargavam o layout da página no Chrome mobile | Grid com `minmax(0, 1fr)`; tabela vira cartões em tela estreita (com `role` explícitos); E2E no projeto `celular` |
