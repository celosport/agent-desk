---
tags: [adr]
---
# ADR-018 — Mandar tarefa pelo app para o Claude Code do PC

- **Status:** aceita (caminho B: sessão nova). O caminho A (canal para sessão já aberta) fica para uma etapa seguinte.
- **Data:** 2026-11-03

## Contexto
O Escritório ao vivo só **mostra** as sessões do Claude Code ([[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]). O usuário quis **mandar trabalho** pelo app, e para
os dois ambientes (PC e nuvem), sem entender como as Automações (API paga por token, [[ADR-006 - Integração com a API da Anthropic]]) se ligavam às sessões. Respostas
do usuário: começar pelo B (sessão nova), depois o A; permissões no modo padrão com Aprovar/Negar no app; só pastas liberadas por ele; PC agora, nuvem depois.

O que a documentação do Claude Code garante (verificado em 2026-11-03): `claude -p` roda sem terminal, aceita `--session-id <uuid>`, lê o prompt pelo stdin, **executa os hooks**
do `~/.claude/settings.json` (sem `--bare`) e, no modo padrão, nega o que pede permissão a não ser que um hook `PermissionRequest` decida — que é exatamente o hook do coletor
([[ADR-015 - Parar e Aprovar-Negar Sessões do Claude Code]]).

## Decisão
- **O coletor ganha o modo `escutar`** (`agentdesk-coletor.mjs escutar`): a cada 5 s informa as pastas liberadas (também serve de sinal "online") e busca tarefas pendentes;
  para cada uma abre `claude -p --session-id <id> --permission-mode default --max-turns 100` **na pasta liberada**, com o texto da tarefa pelo **stdin**. Até 2 ao mesmo tempo,
  3 h no máximo por tarefa. O resultado informado ao app é só o **código de saída** (nada do que o Claude Code escreveu).
- **A pasta é liberada NO PC** (`liberar [pasta]` / `bloquear` / `pastas`), nunca pelo app: quem tem a conta do AgentDesk não consegue escolher onde rodar. Quem manda no PC é o
  dono do PC. O **caminho nunca sai do computador**: o app só vê o nome e a chave (a mesma dos hooks, então o robô da tarefa cai na sala certa).
- **Id da tarefa = id da sessão** (`--session-id`): o robô que aparece no Escritório (pelos hooks de sempre) é o da tarefa; **Parar** e **Aprovar/Negar** já funcionam nele.
- **Segurança:** argumentos do `claude` fixos (o id é um GUID validado); texto só pelo stdin (nada digitado vira comando, mesmo no shell do Windows); nunca
  `--dangerously-skip-permissions`; tarefa para pasta não liberada, ou com id que não é GUID, é recusada sem abrir o `claude`; sem resposta no Aprovar/Negar, o pedido é negado
  (em `-p` não há terminal para perguntar). Até 5 tarefas abertas por usuário; texto até 4000 caracteres.
- **Servidor (módulo Sessoes):** tabelas `cc_pastas_liberadas` e `cc_tarefas`. App (JWT): `GET /computadores`, `GET|POST /tarefas`, `POST /tarefas/{id}/cancelar`. Coletor (token):
  `PUT /controle/pastas`, `GET /controle/tarefas`, `POST /controle/tarefas/{id}/resultado`. Cada tarefa sai **uma vez só** (`FOR UPDATE SKIP LOCKED`). Pendente há mais de 10 min
  aparece **EXPIRADA** e não é mais entregue; em andamento há mais de 6 h aparece como falha (o coletor caiu).

## Consequências
- Precisa de um processo ligado no PC (`escutar` num terminal; no futuro, como serviço/tarefa agendada). Computador desligado = tarefa expira.
- Só vale para o PC. **Nuvem:** o ambiente é da Anthropic (não dá para deixar um programa ouvindo nem passar `--channels`); fica para depois de verificar o que o ambiente permite.
- **Caminho A (próximo):** um canal (servidor MCP) para empurrar a tarefa numa sessão **já aberta**, iniciada com `--channels`. É pré-visualização (a flag e o contrato podem mudar).
- O texto da tarefa passa pelo servidor do AgentDesk e fica guardado (`cc_tarefas.texto`). Não digite segredos nas tarefas.
- Não testado com um `claude` real nesta fase: os testes usam um `claude` de mentira (argumentos, stdin, pasta e código de saída). O primeiro teste de verdade é o do usuário.
