---
tags: [adr]
---
# ADR-010 — Sessões do Claude Code (hooks e telemetria)

- **Status:** aceita
- **Data:** 2026-10-30

## Contexto
O usuário quer acompanhar, como no Habblaud, as sessões **reais** do Claude Code (que usam a assinatura, não a API key) — o que cada
uma está fazendo, quem precisa dele — e ver os tokens para gastar melhor. O AgentDesk roda no Railway; o Claude Code roda no PC.
Requisitos: só metadados saem do PC (nada de código nem texto de prompt), nada pode atrasar o Claude Code, e funciona de várias máquinas.

Fontes oficiais consultadas (2026-10-30): hooks (`code.claude.com/docs/en/hooks.md`), telemetria (`monitoring-usage.md`),
statusline (`statusline.md`), sessões/transcripts (`sessions.md`).

## Decisão
- **Coletor local** (`src/AgentDesk.Web/coletor/agentdesk-coletor.mjs`, Node 18+, sem dependências), baixado do próprio app em
  `/coletor/agentdesk-coletor.mjs`. O comando de instalação (gerado em Configurações → Claude Code) baixa e roda `instalar`, que:
  faz **cópia de segurança** do `~/.claude/settings.json`, **mescla** (não sobrescreve) os hooks e a telemetria e manda uma sessão de
  teste. `desinstalar` tira só o que ele pôs.
- **Hooks** `type: "command"` com **`async: true`** em 11 eventos (SessionStart, UserPromptSubmit, Pre/PostToolUse, PostToolUseFailure,
  Notification, Stop, SubagentStart/Stop, PreCompact; SessionEnd vai síncrono com 3 s, porque hooks assíncronos podem não sair com a
  sessão fechando). O coletor **filtra no PC**: nome da pasta + hash do caminho, ferramenta, nome do arquivo (sem caminho), as duas
  primeiras palavras do comando (descartando o que parece segredo), domínio de URL, tipo de aviso. Sempre sai com 0.
- **Tokens e custo** pela **telemetria oficial** (OpenTelemetry, evento `claude_code.api_request`: modelo, tokens de entrada/saída/cache
  e `cost_usd`), exportada em **OTLP/HTTP JSON** direto para `POST /api/v1/sessoes/otlp/v1/logs` (aceita gzip). Só logs
  (`OTEL_METRICS_EXPORTER=none`); prompts, respostas e detalhes de ferramentas continuam **redigidos** (padrão do Claude Code). Se já
  existir outra telemetria configurada, o instalador não troca (a não ser com `--forcar`).
- **Autenticação** por **token de ingestão** (`adk_…`, 32 bytes aleatórios) no header `X-AgentDesk-Token`; o banco guarda só o
  **SHA-256**; o token aparece uma vez; até 10 ativos por usuário; revogar corta na hora.
- **Módulo `Sessoes`**: `cc_sessoes` (estado atual), `cc_eventos` (linha do tempo, **90 dias**, rotina diária desligável),
  `cc_consumo_diario` (totais por dia/projeto/modelo, **para sempre**). Hooks chegam fora de ordem: evento mais velho que a última
  atividade não muda o status. Telemetria que chega antes do primeiro hook cria a sessão "(sem projeto)"; o hook corrige.
- **Escritório**: aba "Claude Code (ao vivo)" com polling de 3 s; cada projeto é uma sala (até 8 robôs), cada sessão um robô com o
  balão da atividade; "✋ precisa de você" em destaque e anunciado (aria-live). Custo mostrado como **≈ US$** (equivalente na API).

## Alternativas consideradas
- **Hook `type: "http"`** (posta o JSON direto): mandaria o `tool_input` inteiro (conteúdo de arquivos, prompts) para o servidor e não
  tem `async` documentado — atrasaria a sessão.
- **Ler o transcript JSONL**: o formato é interno e muda entre versões (a própria documentação desaconselha).
- **Receber métricas** (`claude_code.token.usage`): agregadas a cada 60 s e sem o detalhe por pedido; os eventos dão tokens por chamada.
- **Instalar o Habblaud**: resolve o "ver ao vivo", mas fica fora do AgentDesk (sem o histórico de custo, o limite e o painel).

## Consequências
- ✅ Sem API key e sem custo extra: usa a assinatura; o Escritório mostra o trabalho real, de qualquer máquina.
- ✅ Privacidade por construção: o filtro é no PC e está coberto por testes (`agentdesk-coletor.spec.mjs` + teste ponta a ponta com
  um `Write` e um `curl` com segredos: nada chegou ao banco).
- ⚠️ O token de ingestão fica no `~/.agentdesk/config.json` e no `env` do `~/.claude/settings.json` (header do OTLP). Vazou? Revogue.
- ⚠️ Precisa de Node 18+ no PC. Sessões abertas antes da instalação só aparecem depois de reiniciadas.
- ⚠️ % das janelas de 5 h e da semana só existe na entrada da statusline (Pro/Max): fica para a Fase 6.

Relacionados: [[00 - Dashboard]] · [[Módulo Sessoes]] · [[Escritório Animado]] · [[ADR-009 - Escritório em Canvas 2D com Motor Puro]]
