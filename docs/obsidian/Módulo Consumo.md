---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo Consumo

Log de cada chamada à API da Claude (tokens, custo, duração, status) — base do painel e do histórico.
Voltar: [[00 - Dashboard]] · Receita: [[Receita - Novo Módulo (API + App)]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Consumo/AgentDesk.Modules.Consumo` |
| Contrato oferecido | `IRegistroConsumo` (SharedKernel) · [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]] |
| App | Fase 3 (painel e histórico) |
| Tabelas | `consumo_chamadas` |
| Testes | `tests/AgentDesk.IntegrationTests/Automacoes` (a gravação é exercitada pelas execuções) |

## Regras de negócio
- Uma linha por chamada: data (UTC), automação (id + nome da época), modelo pedido e modelo que respondeu, tokens de entrada, saída,
  leitura e escrita de cache, `tokens_total` (coluna gerada), **preços usados** (congelados), custo em US$ (6 casas), duração em ms,
  status `SUCESSO` / `ERRO` / `RECUSADA`, `erro_codigo`, `motivo_parada` (stop_reason), nome do arquivo e o **resultado**.
- A entrada do usuário **não** é guardada.
- Gasto do período = soma de `custo_usd` (usado pelo limite mensal).

## Endpoints
Fase 3: totais (dia, mês, acumulado), gráfico por dia, ranking por automação e histórico com filtros.

## Pendências
- [ ] Fase 3: painel com polling (`core/tempo-real`) e histórico filtrável; reabrir o resultado de uma chamada.

Criado em 2026-10-30.
