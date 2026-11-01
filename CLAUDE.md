# AgentDesk — regras para quem programa aqui (humano ou Claude Code)

Monólito modular em **.NET 8 + Dapper + PostgreSQL 16** com app **Angular 22 PWA** (`src/AgentDesk.Web`). Este arquivo é lido automaticamente pelo Claude Code.
Documentação = cofre do Obsidian em **`docs/obsidian/`** (entrada: `00 - Dashboard.md`). Padrões: `Arquitetura e Padrões.md` (backend) e `Frontend (Angular PWA).md` (app). Decisões: `ADRs/`.

<!-- CONTEXTO:INICIO -->
## Contexto deste projeto (gerado pelo novo-projeto.sh em 2026-10-30)
**Agent Desk** — Painel de consumo e automações com a API da Claude, com escritório animado dos agentes
- Perfis além de USUARIO/ADMIN: **nenhum** · Módulos iniciais: **Configuracoes,Automacoes,Consumo** · Manter exemplo Tarefas: ~~sim~~ removido na Fase 2
- Offline: **não** · Plano pago: **não** · Lojas (Capacitor): **não**
- Já aplicado pelo script: nome, nome de exibição, descrição, cor (#3b5bdb) e portas.
- ✅ Perguntas respondidas (2026-10-30) — ver `Perguntas para Novo Projeto.md` e ADR-005 a 007. Perfis: só USUARIO/ADMIN (nada a mudar).
- Entrega por fases, uma branch cada (`feat/fase-N-...`): ✅ Fase 1 Configuracoes · ✅ Fase 2 Automacoes (+ Tarefas removido) ·
  ✅ Fase 3 Consumo · ✅ Fase 4 Escritório · ✅ Fase 5 Sessões do Claude Code (ao vivo) · ✅ Fase 6a Equipe (nome e aparência dos agentes) · ✅ Fase 6b painel de tokens do Claude Code (cancelar tarefa, tempos, painel, dicas, histórico, statusline 5 h/semana) · ✅ Fase 6c Parar e Aprovar/Negar sessões do Claude Code (ADR-015) · ✅ Fase 7 moedas (R$, € e £ pela PTAX do Banco Central; dado em dólar, conversão só na exibição; ADR-014) · ✅ Alertas no celular (módulo Notificacoes: push do app instalado quando uma tarefa termina; ADR-016).
- Sessões do Claude Code: coletor no PC (`src/AgentDesk.Web/coletor/`) filtra os hooks — **só metadados** saem do PC; tokens pela telemetria OTLP/JSON. Ver ADR-010.
- Integração com a Claude: só via `IClienteAnthropic` (SharedKernel); nos testes, `AnthropicFalso` — nunca chamada real nem chave real.
- Modelos e preços **nunca** no código: tabela `modelos_claude` (ADMIN edita).
- Contratos entre módulos ficam em `SharedKernel/Contratos` (`IConfiguracoesDeUso`, `IRegistroConsumo`) — [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]].
<!-- CONTEXTO:FIM -->

## Projeto novo (primeira sessão)
1. Leia `docs/obsidian/Perguntas para Novo Projeto.md`. **Antes de criar o primeiro módulo**, pergunte ao usuário (de uma vez, em lista)
   tudo que estiver em branco ou "a definir" — principalmente perfis, módulos, dono dos dados (por usuário × por empresa), offline e plano pago.
2. Registre as respostas na tabela da nota e, se forem decisões de arquitetura, crie ADRs (`docs/obsidian/_Modelos/Modelo - ADR.md`).
3. Aplique: perfis (enum `PerfilUsuario` + `Perfis` no SharedKernel, `CHECK` em `usuarios.tipo_perfil`, `Perfil` em `auth.models.ts`,
   `rotaInicial()` nos guards), módulos (receita abaixo) e, se pediram, remova o exemplo **Tarefas** de ponta a ponta
   (módulo, ProjectReference, `.slnx`, `ModuleExtensions`, tabela, testes, `features/tarefas`, rota, menu, mock, E2E e nota).
4. Atualize a seção "Contexto deste projeto" acima e o histórico do `00 - Dashboard.md`.

## Comandos
- Banco: `docker compose up -d`
- **API + App juntos:** F5 no Visual Studio (perfil "AgentDesk (API + App)") ou `dotnet run --project src/Host/AgentDesk.API` — o SPA Proxy sobe o `ng serve` em http://localhost:4210.
- Só o app sem backend: `cd src/AgentDesk.Web && npm run start:mock`
- Testes backend: `dotnet test` (Docker) ou `AGENTDESK_TESTES_BANCO="Host=...;Username=postgres;Database=postgres" dotnet test` (sem Docker)
- Testes app: `cd src/AgentDesk.Web && npm test` (Vitest) · `npm run e2e` (Playwright, build com service worker + mock)
- A `.slnx` pede SDK ≥ 9.0.200; se o SDK for o 8, compile/teste pelos projetos (`dotnet build src/Host/AgentDesk.API`).

## Arquitetura do backend (não quebrar)
1. **Um módulo = um projeto** em `src/Modules/<Nome>/AgentDesk.Modules.<Nome>/` com `Domain/`, `Application/`, `Infrastructure/`, `Endpoints/`.
2. **Módulo → SharedKernel apenas.** Um módulo **nunca** referencia outro nem o Npgsql. Comunicação entre módulos = interface no SharedKernel implementada pelo dono.
3. **Controller enxuto:** só traduz HTTP ↔ Command/Query e `Result` ↔ status. Sem SQL, sem regra.
4. **CQRS leve, sem MediatR:** `ICommand/IQuery` + handler; registro explícito no `IModule` (`AddCommandHandler` ganha o decorator de FluentValidation).
5. **Erro de negócio = `Result`/`Error` com código estável** (`"Automacoes.NaoEncontrada"`), nunca exceção. 500 nunca expõe `ex.Message`.
6. **Dapper com SQL explícito** (raw string `"""`, parâmetros nomeados, `CommandDefinition` com `CancellationToken`). Nunca concatenar SQL.
7. **Visibilidade:** Command, Query e DTOs `public`; handler, validator, repositório e domínio `internal sealed`.
8. **O usuário vem do token** (`IUsuarioAtual`), nunca do body. Tudo é filtrado pelo dono do dado; dado de outro = `404`.
9. **Segurança por padrão:** toda rota exige JWT, salvo `[AllowAnonymous]`.

## Arquitetura do app (não quebrar) — `src/AgentDesk.Web`
1. `core/` (singletons: auth, config, http, mock, ui, tema) · `shared/` (UI burra e funções puras) · `features/` (uma por área, **lazy**). `features → core/shared`; **feature não importa feature**.
2. Standalone + `ChangeDetectionStrategy.OnPush`; estado em **stores com signals** por feature (`data-access/*.store.ts`).
3. **A tela nunca monta URL:** só `data-access/*.api.ts`. Models = DTOs da API com os mesmos nomes do JSON (camelCase, enums `SNAKE_CASE_UPPER`).
4. Erro da API: decidir pelo **`code`** do problem+json (`codigoDeErro`), mostrar o texto do servidor (`mensagemDeErro`).
5. Rotas protegidas por guards (`autenticadoGuard`, `anonimoGuard`, `perfilGuard`). Datas da API em UTC → formatar com `shared/util/formatos.ts`.
6. **Endpoint novo = resposta no `core/mock/mock-api.interceptor.ts` + teste E2E**, no mesmo commit. Localizadores por papel/rótulo (acessibilidade).
7. Porta da API mudou? `launchSettings.json`, `environment.development.ts`, `scripts/iniciar-com-api.mjs` e `Cors:Origins`.

## Receita: módulo novo (API + App + docs)
Siga `docs/obsidian/Receita - Novo Módulo (API + App).md`: schema → módulo (copie `Configuracoes`, o exemplo de referência desde que o Tarefas saiu) → testes de integração → feature (copie `features/configuracoes`) → rota/menu → mock + E2E → nota do módulo + linha no Dashboard.

## Banco
- `database/schema.sql` é **idempotente** (roda a cada deploy): `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, constraints em `DO $$ ... EXCEPTION WHEN duplicate_object`.
- snake_case em português; enums como texto + `CHECK`; `TIMESTAMPTZ` em UTC; ids `UUID`.
- Dados de uma vez só: tabela `migracoes_dados` (nome único) — nunca rodar duas vezes.
- **Coluna nova = mudança no schema.sql + SQL do repositório + teste**, no mesmo commit.

## Testes (obrigatórios em toda mudança de comportamento)
- Backend: integração com API e PostgreSQL reais (`WebApplicationFactory` + Testcontainers). Escreva o teste junto do código.
- App: Vitest para regras puras/stores/guards; Playwright (computador + celular) para fluxos.
- Rotinas em segundo plano ficam **desligadas nos testes** por variável de ambiente (`...__RotinaHabilitada=false`).
- Teste de regra por horário: injete `TimeProvider`, nunca `DateTime.Now`/`UtcNow`.

## Documentação (Obsidian) — mantenha junto com o código
- Notas com wikilinks (`[[Nome da Nota]]`); comentários no código podem citar ADRs (`[[ADR-003 - Frontend Junto da API (SPA Proxy)]]`).
- Módulo novo → nota de `_Modelos/Modelo - Módulo.md` + linha na tabela do `00 - Dashboard.md`. Decisão relevante → ADR em `ADRs/`.
- Armadilha nova → tabela §10 de `Arquitetura e Padrões.md` (e no esqueleto, para os próximos projetos já nascerem certos).
- Não edite `.obsidian/workspace.json` (estado da janela, fora do Git).

## Armadilhas já vividas (ver Arquitetura e Padrões §10)
- `DateTimeOffset` com offset ≠ 0 **quebra a gravação** no Npgsql: converta com `.ToUniversalTime()`.
- Lista no Dapper/Npgsql: `WHERE x = ANY(@Ids)` com array, não `IN @Ids`.
- Subida na nuvem: o `/health` precisa responder **antes** de o schema terminar; log do Npgsql em `Warning`.
- PWA: a versão nova só vale após recarregar — o aviso "Atualizar" (`AtualizacaoApp`) precisa continuar no `App`.
- Visual Studio traz um Node antigo no PATH: o `iniciar-com-api.mjs` procura outro; não troque o comando do SPA Proxy por `ng serve` direto.
- **Nenhum segredo no Git** (senha de banco, chaves). Use `user-secrets`/variáveis de ambiente.
- Falha engolida em `try/catch` precisa de **teste**: o log não é suficiente.

## Git
- Trabalhe na branch indicada; commits pequenos com mensagem em português (`feat:`, `fix:`, `chore:`, `docs:`).
- Só abra PR quando pedirem.
