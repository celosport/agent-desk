---
tags: [adr]
---
# ADR-017 — Ajudantes (subagentes), grupos de salas e lugar fixo do robô

- **Status:** aceita
- **Data:** 2026-11-03

## Contexto
No Escritório ao vivo ([[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]) o usuário via o trabalho "um por um", robôs "se perdendo" e o nome/aparência
salvos na Equipe ([[ADR-011 - Equipe Personalizada (Nome e Aparência dos Agentes)]]) **voltando ao padrão**. Causas encontradas:
1. um subagente era só o balão "Chamando subagente…" da sessão que o chamou — não aparecia como robô;
2. a sala é a pasta do projeto: worktrees e o mesmo projeto no PC e na nuvem viravam salas separadas;
3. a sessão encerrada saía da sala em 2 min, e com mais de 8 robôs uma sessão parada podia tirar a mesa de quem trabalhava;
4. **o agente da Equipe é salvo por (projeto, posição)**, mas a posição era decidida **no navegador, pela ordem de chegada**: ao recarregar, trocar de sala ou quando
   uma sessão acabava, as posições mudavam e o nome salvo ia para outro robô (ou sumia).

## Decisão
- **Ajudantes:** o coletor manda `agenteId`/`agenteTipo` (`agent_id`/`agent_type` dos hooks) quando o hook roda dentro de um subagente. O servidor guarda cada
  subagente em `cc_subagentes` e o `ao-vivo` devolve `subagentes` dentro da sessão. Ferramentas usadas **dentro** do subagente mexem só no robô dele; a sessão
  segue "Chamando subagente…". No app, cada ajudante é um robô com o **tipo como nome** (Explore, Plan...) e antena de bolinha; fica só com as **mesas que sobrarem**
  (sessões têm prioridade). Sai no `SubagentStop`, no `SessionEnd` da sessão ou sem sinal há 10 min.
- **Grupos de salas:** o usuário junta salas (`PUT /api/v1/sessoes/grupos`, tabela `cc_grupos_salas`, até 100 salas). Salas do mesmo grupo viram **uma sala só** no app
  (chave `g:<nome>`). Não há junção automática por nome de pasta (duas pastas "api" podem ser projetos diferentes): o app só **sugere** quando acha outra sala com o mesmo nome.
- **Lugar fixo:** `cc_sessoes.lugar` (0 a 7) é dado **pelo servidor** na criação da sessão (menor lugar livre entre as sessões abertas do mesmo projeto) e **não muda** enquanto a
  sessão existir. O nome/aparência da Equipe valem por **(projeto da sessão, lugar)** — por isso continuam certos mesmo em sala de grupo. A mesa desenhada na cena é outra coisa
  (decidida no navegador); só a identidade vem do servidor.
- **Permanência:** sessão encerrada fica 15 min (era 2). Com mais de 8 robôs, quem precisa de você e quem trabalha ficam; parada/encerrada saem primeiro.

## Consequências
- Quem já usa precisa **atualizar o coletor** no PC para ter ajudantes: `node ~/.agentdesk/agentdesk-coletor.mjs atualizar`. Na nuvem, o script de preparação baixa sempre a versão nova.
- Sessões abertas antes desta versão ganham o lugar no próximo evento delas; os agentes salvos por posição podem ser reatribuídos **uma vez**.
- Se as 8 mesas do projeto já estão ocupadas, a sessão nova fica sem lugar (nome automático) até uma liberar.
- Só metadados saem do PC, como antes: `agent_id` e `agent_type` não trazem conteúdo.
