---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo Sessoes

As sessões reais do Claude Code (da assinatura) chegando ao vivo do PC do usuário: tokens de ingestão, eventos dos hooks e tokens/custo
da telemetria. Decisão: [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]. Voltar: [[00 - Dashboard]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Sessoes/AgentDesk.Modules.Sessoes` |
| Coletor (PC do usuário) | `src/AgentDesk.Web/coletor/agentdesk-coletor.mjs` (servido em `/coletor/agentdesk-coletor.mjs`) |
| App | `features/configuracoes/conexao-claude.component.ts` (conectar) · `features/escritorio/sala-claude-code.component.ts` (ao vivo) |
| Tabelas | `tokens_ingestao`, `cc_sessoes`, `cc_eventos` (90 dias), `cc_consumo_diario` (para sempre) |
| Testes | `tests/AgentDesk.IntegrationTests/Sessoes` · `coletor/agentdesk-coletor.spec.mjs` · `sessoes.store.spec.ts` · `motor/sessao.spec.ts` · `e2e/claude-code.spec.ts` |

## Como conectar (usuário)
1. **Configurações → Claude Code**: nome do computador → **Gerar token e comando** → copiar (Windows ou macOS/Linux).
2. Colar no terminal do PC (Node 18+). Ele baixa o coletor, faz backup do `~/.claude/settings.json`, adiciona hooks e telemetria e manda
   uma sessão de teste (sala "agentdesk-teste").
3. Abrir uma sessão **nova** do Claude Code → **Escritório → Claude Code (ao vivo)**.
4. Para tirar: `node ~/.agentdesk/agentdesk-coletor.mjs desinstalar` e revogar o token.

## Regras de negócio
- Status: `TRABALHANDO` (pedido/ferramenta), `ESPERANDO_VOCE` (aviso de permissão ou pergunta), `OCIOSA` (terminou/esperando o
  próximo pedido; ou sem sinal há 30 min), `ENCERRADA` (fim da sessão; some da sala depois de 2 min).
- Atividade do balão: "📖 Lendo api.ts", "✏️ Editando…", "📝 Escrevendo…", "💻 Rodando npm test", "🔎 Procurando…", "🌐 Abrindo
  docs.x.com", "👥 Chamando subagente…", "🗜️ Compactando o contexto", "🔌 Usando github" (MCP)…
- Sala = projeto (nome da pasta + hash do caminho completo: duas pastas "api" diferentes são duas salas). Até 8 robôs por sala.
- No "ao vivo": sessões com atividade nas últimas 12 h.
- Evento fora de ordem (mais velho que a última atividade) entra na linha do tempo, mas não muda o status.
- Custo = `cost_usd` da telemetria (preço de tabela da API) — na assinatura, é o **equivalente**, não uma cobrança.

## Endpoints
| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/sessoes/tokens` | logado | 200 (sem o segredo) |
| POST | `/api/v1/sessoes/tokens` | logado | 201 `{ token, segredo }` · 400 · 409 `Sessoes.LimiteDeTokens` (10 ativos) |
| DELETE | `/api/v1/sessoes/tokens/{id}` | logado (dono) | 204 · 404 `Sessoes.TokenNaoEncontrado` |
| GET | `/api/v1/sessoes/ao-vivo` | logado | 200 salas e sessões |
| POST | `/api/v1/sessoes/eventos` | header `X-AgentDesk-Token` | 202 (evento desconhecido: aceito e ignorado) · 400 · 401 `Sessoes.TokenInvalido` |
| POST | `/api/v1/sessoes/otlp/v1/logs` | header `X-AgentDesk-Token` | 200 `{}` (OTLP/JSON, gzip ok) · 400 · 401 |

## Pendências
- [ ] Fase 6: painel de tokens das sessões (por projeto, modelo, ferramenta; cache; dicas de economia) e % das janelas de 5 h/semana.
- [ ] Codex (mesmo formato de evento).
- [ ] Aprovar permissões pelo Escritório (hook que espera a resposta).

Criado em 2026-10-30.

## Painel de tokens do Claude Code (Fase 6b-2)
Aba **Claude Code (assinatura)** na tela Consumo (`features/consumo/painel-claude-code.component.ts`), em cima de `cc_consumo_diario` e `cc_eventos`.

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| GET | `/api/v1/sessoes/painel?escopo=MEU\|TODOS&dias=30` | logado (`TODOS` só ADMIN) | 200 `PainelClaudeCodeDto` · 403 `Sessoes.SemPermissao` |

- Totais de **hoje, mês e acumulado** (tokens, ≈ US$, pedidos), série por dia (todos os dias da janela, de 7 a 90), ranking por **projeto** e por **modelo**.
- **Taxa de cache** = leitura ÷ (entrada + leitura + escrita), de 0 a 1. **Cache baixo** = abaixo de 60% com pelo menos 5 pedidos (`RegrasCache`): a tela destaca por projeto, modelo e dia.
- **Ferramentas**: contagem de `PreToolUse` (hooks, 90 dias). A telemetria informa tokens por pedido ao modelo, **não por ferramenta**: não há rateio.
- ≈ US$ é o que as chamadas custariam na API; na assinatura não se paga por token. Escopo TODOS soma todos os usuários.

## Dicas e histórico de sessões (Fase 6b-3)
Calculadas no servidor (`Domain/Dicas.cs`, funções puras testadas sem banco). Tela: `/consumo/sessoes` e o cartão de dicas na aba Claude Code.

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| GET | `/api/v1/sessoes/dicas?escopo=` | logado (`TODOS` só ADMIN) | 200 `DicasDto` · 403 `Sessoes.SemPermissao` |
| GET | `/api/v1/sessoes/historico?escopo=&projeto=&de=&ate=&pagina=&tamanho=` | logado | 200 `PaginaHistoricoSessoesDto` (90 dias, 20 por página, máx. 100) |
| GET | `/api/v1/sessoes/historico/{sessaoId}?escopo=` | dono (ADMIN com `TODOS`) | 200 `LinhaDoTempoDto` (até 1.000 eventos) · 404 `Sessoes.NaoEncontrada` |

**As 5 regras (últimos 7 dias)** — a economia é uma *estimativa grosseira* (fatia do custo da sessão), sempre rotulada assim:
| Regra | Dispara quando | Economia estimada |
|---|---|---|
| `CACHE_BAIXO` | sessão com 20+ pedidos e cache abaixo de 60% | custo × (80% − taxa) × 0,5 |
| `SESSAO_GIGANTE` | 150+ pedidos ou 20 mi+ de tokens | 25% do custo |
| `MUITAS_COMPACTACOES` | 3+ eventos `PreCompact` | 15% do custo |
| `MODELO_CARO` | Opus/Fable, 10+ pedidos e no máximo 3 edições de arquivo | 60% do custo |
| `DIA_FORA_DA_CURVA` | custo do dia > 2× a média dos outros dias com uso (3+ dias de uso, dia ≥ US$ 1) | custo do dia − média |

A linha do tempo agrupa hora a hora (Brasília) e esconde `PostToolUse` (ruído).

## Janelas de 5 h e da semana (Fase 6b-4)
Tabela `cc_limites` (usuário × janela). Decisão: [[ADR-013 - Janelas de Uso da Assinatura (Statusline)]].

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| POST | `/api/v1/sessoes/limites` | token de ingestão (`X-AgentDesk-Token`) | 202 · 400 (percentual fora de 0–100, nenhuma janela) · 401 `Sessoes.TokenInvalido` |
| GET | `/api/v1/sessoes/limites` | logado (só as próprias) | 200 `{ cincoHoras?, semana?, atualizadoEm? }` |

Coletor: modos `statusline` e `atualizar` (`src/AgentDesk.Web/coletor`). O painel (aba Claude Code) mostra as barras e quando renovam.

## Controle: Parar e Aprovar/Negar (Fase 6c)
Decisão: [[ADR-015 - Parar e Aprovar-Negar Sessões do Claude Code]]. Tabelas `cc_paradas` e `cc_permissoes`.

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| POST | `/api/v1/sessoes/{sessaoId}/parar` | logado (dono) | 202 · 404 `Sessoes.SessaoNaoEncontrada` |
| POST | `/api/v1/sessoes/permissoes/{id}/decidir` | logado (dono) | 204 · 400 (`decisao` ≠ APROVAR/NEGAR) · 404 `Sessoes.PermissaoNaoEncontrada` (venceu) · 409 `Sessoes.PermissaoJaDecidida` |
| GET | `/api/v1/sessoes/controle/parada?sessaoId=` | token de ingestão | 200 `{ parar }` (consome o pedido) |
| POST | `/api/v1/sessoes/controle/permissoes` | token de ingestão | 201 `{ permissaoId, expiraEm }` · 409 `Sessoes.PermissoesPendentesDemais` |
| GET | `/api/v1/sessoes/controle/permissoes/{id}?espera=45` | token de ingestão | 200 `{ decisao }` (nulo = sem decisão) |

`GET /ao-vivo` ganha `permissaoPendente` e `pararSolicitado` por sessão. No app: cartão "✋ Pedidos de permissão" (todas as salas) com Aprovar/Negar,
e botão **Parar** na sessão selecionada.

