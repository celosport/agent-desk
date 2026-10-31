---
tags: [adr]
---
# ADR-011 — Equipe personalizada (nome e aparência dos agentes)

- **Status:** aceita
- **Data:** 2026-10-31

## Contexto
No [[Escritório Animado]] os robôs têm nome e visual fixos. O usuário quer batizar e vestir cada agente (automações e as equipes
das sessões do Claude Code por projeto) sem que isso mexa nos módulos Automacoes e Sessoes.

## Decisão
- Módulo próprio **Equipe**, com a tabela `agentes_personalizados` (tabela 9 do `schema.sql`); o módulo só guarda a personalização.
  O que não estiver na tabela continua com o padrão do Escritório (o app decide o padrão).
- Identidade do agente = `(usuario_id, alvo, chave, ordem)`. `AUTOMACAO`: chave = código da automação, ordem 0. `PROJETO`: chave =
  `projeto_chave` das sessões; a ordem (0 a 7) é a posição na equipe — a 1ª sessão a chegar na sala usa o agente de ordem 0, etc.
- Sem referência entre módulos: a chave é texto, sem FK para automações/sessões (nada quebra se a automação some).
- Cores `#rrggbb` (gravadas em minúsculas); acessório, antena e expressão são listas fechadas com `CHECK` no banco e validação na API.
- Salvar é um *upsert* (`PUT /api/v1/equipe`); "restaurar padrão" apaga a linha (`DELETE`).

## Consequências
- Excluir o usuário apaga a equipe (`ON DELETE CASCADE`).
- Novo acessório/antena/expressão = mudar o `CHECK` do schema **e** `OpcoesAgente`, no mesmo commit.
