---
tags: [adr]
---
# ADR-012 — Cancelar a tarefa do agente

- **Status:** aceita
- **Data:** 2026-10-31

## Contexto
A execução de uma automação é uma chamada só, que fica aberta até a Claude responder. Depois de iniciada, não havia como parar.
A API da Anthropic não tem "pausar": só dá para abandonar a chamada.

## Decisão
- **Só cancelar** (sem pausar). O app gera o `execucaoId` e o manda no `executar`; `POST /api/v1/automacoes/execucoes/{id}/cancelar`
  interrompe a chamada à Claude. Só o dono cancela (id de outro usuário = 404).
- O registro das execuções em andamento fica **em memória** (`IExecucoesEmAndamento`, singleton): reiniciar o servidor encerra as
  chamadas de qualquer forma.
- Cancelada vira a linha `CANCELADA` em `consumo_chamadas` (tokens e custo 0: a Anthropic não devolve o uso; os tokens de entrada
  podem ter sido cobrados). A execução original responde `422 Automacoes.Cancelada`; o app mostra o balão "Execução cancelada",
  sem painel de erro.
- **Fechar a aba não cancela** (como antes): a chamada termina e o consumo é gravado. Só o botão cancela.
- Início e fim: `finalizadaEm` = `iniciadaEm` + `duracaoMs`, calculado no DTO (sem coluna nova).

## Consequências
- Novo valor de status exige o `CHECK` do schema (bloco idempotente que só troca a constraint se ainda não aceita `CANCELADA`).
- Em vários servidores, o cancelamento precisaria de um canal entre eles (hoje há um só no Railway).
