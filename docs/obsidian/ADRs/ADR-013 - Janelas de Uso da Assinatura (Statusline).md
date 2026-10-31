---
tags: [adr]
---
# ADR-013 — Janelas de uso da assinatura (statusline)

- **Status:** aceita
- **Data:** 2026-10-31

## Contexto
Quem usa o Claude Code pela assinatura (Pro/Max) tem limites por janela de 5 horas e por semana. Esse percentual só existe na entrada
da **statusline** do Claude Code (`rate_limits.five_hour` e `rate_limits.seven_day`, com `used_percentage` de 0 a 100 e `resets_at` em
segundos Unix). Aparece só para Pro/Max, depois da 1ª resposta da sessão, e cada janela pode faltar. Fonte: `code.claude.com/docs/en/statusline.md`
(2026-10-31). Vem de [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]] ("fica para a Fase 6").

## Decisão
- O coletor ganha o modo `statusline`: imprime `AgentDesk · 5h 34% · semana 38%` na barra e envia **só esses dois percentuais e as
  renovações** ao app, **no máximo 1 vez por minuto** (estado em `~/.agentdesk/statusline-estado.json`; a hora é marcada antes de enviar,
  então rede ruim não martela o servidor). Sempre sai com 0 e nunca atrapalha o Claude Code.
- **Statusline do usuário é respeitada:** se já houver uma, o `instalar` a mantém e avisa; `--statusline` troca. O `desinstalar` só remove a nossa.
- Modo `atualizar`: baixa o coletor novo e reaplica tudo com a conexão salva (url, token, máquina), **sem gerar outro token**.
- API: `POST /api/v1/sessoes/limites` (token de ingestão, 202) guarda a última leitura por usuário e janela em `cc_limites`;
  `GET /api/v1/sessoes/limites` devolve as janelas que ainda valem. Janela com renovação no passado ou a mais de 8 dias é descartada;
  janela que já renovou some (a barra volta quando o Claude Code informar de novo). Percentual de 0 a 100 (validação 400).
- A assinatura é pessoal: o ADMIN não vê as janelas de outros usuários (não há escopo TODOS).
- O app mostra as duas barras (verde, laranja a partir de 70%, vermelho a partir de 90%) e quando cada janela renova.

## Consequências
- Sem plano Pro/Max (ou sem rodar o `atualizar`), o painel explica de onde vêm as barras em vez de mostrar zero.
- Quem já tinha instalado precisa rodar o comando de atualização uma vez (Configurações → "Já conectei antes").
