---
tags: [adr]
---
# ADR-015 — Parar e Aprovar/Negar sessões do Claude Code

- **Status:** aceita
- **Data:** 2026-10-31

## Contexto
No "Claude Code ao vivo" o app só observava. O usuário quer **cancelar** um agente e **aprovar/negar** os pedidos de permissão pelo app
(o Habblaud mostra aprovar/negar no celular; cancelar ele não documenta). O Claude Code roda no PC; o app, na nuvem.
Fonte dos hooks: `code.claude.com/docs/en/hooks.md` (2026-10-31).

## Decisão
- **Hooks síncronos** (sem `async`) chamam o modo `controle` do coletor; o coletor **pergunta** ao servidor (o PC nunca recebe conexão de fora):
  - `PreToolUse` (timeout 5 s): `GET /sessoes/controle/parada?sessaoId=`. Se o app pediu **Parar**, o hook responde
    `{ continue: false, stopReason, permissionDecision: "deny" }`: a ferramenta daquela vez não roda e o Claude Code interrompe o turno.
    O pedido vale **uma vez** (consumido com `DELETE ... RETURNING`) e expira em 2 minutos.
  - `PermissionRequest` (timeout 60 s): `POST /sessoes/controle/permissoes` (ferramenta + resumo seguro) e `GET .../permissoes/{id}?espera=45`
    (long polling). Decisão do app → `{ decision: { behavior: "allow" | "deny" } }`.
- **Nunca aprova sozinho.** Sem decisão em ~50 s, erro, rede fora ou servidor lento: o hook sai sem resposta (código 0) e o Claude Code
  pergunta no terminal como sempre. O pedido vence em 55 s e some do app.
- **Parar vale na próxima ferramenta**, não no meio de um pensamento: é o limite de usar hooks (o Claude Code só consulta hooks nesses pontos).
- **Custo:** 1 consulta curta (até 2,5 s, normalmente 100–300 ms) antes de cada ferramenta. Quem não quer instala com `--sem-controle`
  (só observa, sem hooks síncronos); `atualizar --com-controle` volta atrás.
- **Segurança:** o app (JWT) decide; o coletor (token de ingestão) pergunta. Só o dono vê e decide os próprios pedidos (404 para outro usuário);
  no máximo 20 pedidos pendentes por usuário; só ferramenta e resumo curto saem do PC (mesmo filtro dos outros hooks: sem conteúdo, sem comando completo).
- Tabelas `cc_paradas` e `cc_permissoes`; vencidos há mais de 1 dia são apagados pela rotina diária.

## Consequências
- Quem já instalou precisa rodar `atualizar` uma vez. Versões do Claude Code sem o hook `PermissionRequest` simplesmente não mostram pedidos.
- Se o servidor ficar lento, o hook de ferramenta estoura em 5 s e o Claude Code segue (nada trava).
