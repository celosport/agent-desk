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

