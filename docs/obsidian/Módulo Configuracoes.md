---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo Configuracoes

API key da Anthropic de cada usuário (cifrada), modelo padrão, limite de gasto mensal e a tabela de modelos/preços mantida pelo ADMIN.
Voltar: [[00 - Dashboard]] · Receita: [[Receita - Novo Módulo (API + App)]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Configuracoes/AgentDesk.Modules.Configuracoes` |
| Integração | `IClienteAnthropic` (SharedKernel) → `ClienteAnthropic` (Infrastructure) · [[ADR-006 - Integração com a API da Anthropic]] |
| App | `src/AgentDesk.Web/src/app/features/configuracoes` (`configuracoes.page.ts` + `modelos-precos.component.ts`) |
| Tabelas | `configuracoes_usuario`, `modelos_claude`, `chaves_protecao_dados` (anel do Data Protection) |
| Testes | `tests/AgentDesk.IntegrationTests/Configuracoes` · `e2e/configuracoes.spec.ts` · `configuracoes.store.spec.ts` |

## Regras de negócio
- A API key **entra e nunca sai**: é cifrada com Data Protection e só os 4 últimos caracteres ficam em claro (`sk-ant-...abcd`).
  → [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]]
- Formato aceito: começa com `sk-ant-`, de 20 a 400 caracteres, sem espaços (os espaços nas pontas são aparados).
- "Testar chave" usa a chave **salva** (nunca uma vinda do navegador) e chama `GET /v1/models?limit=1`, que não gasta tokens.
- Chave que não decifra mais (anel apagado) aparece como **não configurada**; o usuário cadastra de novo.
- Modelo padrão: só um modelo **ativo** da tabela. Se o ADMIN desativar o modelo, a tela avisa para escolher outro.
- Limite mensal opcional (> 0, até 2 casas). `bloquearAoAtingirLimite` (padrão `true`) decide se, a 100%, bloqueia ou só avisa
  (a regra é aplicada na Fase 2, nas Automações). → [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]
- Tabela de modelos: id = id da API; preços em US$ por **milhão** de tokens (0 a 10.000, até 4 casas). Modelo não se apaga: desativa.
  A carga inicial (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5) roda **uma vez** (`migracoes_dados`); depois, vale o que o ADMIN editar.
- `fallbackRecusa` por modelo: liga o fallback da Anthropic quando o filtro de segurança recusa (Fase 2) — [[ADR-006 - Integração com a API da Anthropic]].

## Endpoints
| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/configuracoes` | logado | 200 `ConfiguracaoDto` |
| PUT | `/api/v1/configuracoes/chave-api` | logado | 200 · 400 (`chaveApi`) |
| DELETE | `/api/v1/configuracoes/chave-api` | logado | 200 |
| POST | `/api/v1/configuracoes/chave-api/testar` | logado | 200 `{ valida, testadaEm }` · 422 `Configuracoes.ChaveNaoConfigurada` · 422 `Anthropic.ChaveInvalida` · 503 `Anthropic.LimiteDeTaxa` / `Anthropic.Indisponivel` |
| PUT | `/api/v1/configuracoes/preferencias` | logado | 200 · 400 (`limiteMensalUsd`) · 422 `Configuracoes.ModeloInvalido` |
| GET | `/api/v1/modelos` | logado | 200 `ModeloDto[]` (ativos primeiro) |
| POST | `/api/v1/modelos` | ADMIN | 201 · 400 · 403 · 409 `Modelos.JaExiste` |
| PUT | `/api/v1/modelos/{modeloId}` | ADMIN | 200 · 400 · 403 · 404 `Modelos.NaoEncontrado` |

## Telas
- **Configurações** (`/configuracoes`, menu "Configurações"): chave (salvar, testar, remover), modelo padrão e limite.
- **Modelos e preços** (mesma tela, só ADMIN): editar na linha, ativar/desativar e adicionar. No celular, cada modelo vira um cartão.

## Pendências
- [x] Fase 2: contrato `IConfiguracoesDeUso` (chave decifrada, preferências, preço) para o Automacoes — [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]].
- [ ] Preço por faixa (ex.: Haiku 5.5 acima de 100K tokens) não é modelado.

Criado em 2026-10-30.
