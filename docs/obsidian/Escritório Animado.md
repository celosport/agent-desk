---
tags: [feature, frontend]
status: pronto
---
# 🏢 Escritório Animado

Duas salas: **Claude Code (ao vivo)** — as suas sessões reais, um robô por sessão e uma sala por projeto ([[Módulo Sessoes]]) — e
**Automações**, onde cada automação é um robô numa sala em pixel art isométrica: ao receber um pedido, ele anda até a mesa, mostra "pensando…" e, quando
a Claude responde, um balão com os tokens e o custo. Só app (usa a API do [[Módulo Automacoes]]). Decisão: [[ADR-009 - Escritório em Canvas 2D com Motor Puro]].
Voltar: [[00 - Dashboard]]

| Parte | Onde |
|---|---|
| Página e cena | `src/AgentDesk.Web/src/app/features/escritorio` (`escritorio.page.ts`, `cena-escritorio.component.ts`) |
| Motor (puro) | `motor/iso.ts` (projeção e rota), `motor/agente.ts` (estados), `motor/personagens.ts` (robôs em camadas — antena, expressão, acessório — e lugares; personalização em [[Módulo Equipe]]) |
| Desenho | `motor/desenho.ts` (Canvas 2D, paleta clara e escura) |
| Estado | `data-access/escritorio.store.ts` (+ `escritorio.api.ts`) |
| Testes | `motor/motor.spec.ts` · `escritorio.store.spec.ts` · `e2e/escritorio.spec.ts` |

## Personagens
| Robô | Automação (`codigo`) | Cor |
|---|---|---|
| **Rel** | Gerar Relatório Executivo (`relatorio-executivo`) | azul |
| **Bit** | Analisar Código (`analisar-codigo`) | verde |
| **Sumi** | Resumir Documento (`resumir-documento`) | laranja |
| Agente | qualquer outro código | cor pelo hash do código |
| Ada, Bolt, Cubo… | sessões do Claude Code | apelido e cor pelo id da sessão |

## Regras
- Fases: disponível → indo para a mesa → pensando… (mín. 0,7 s) → resultado (9 s) → voltando → disponível.
- Resultado no balão: `1.800 tokens · US$ 0,0004` (+ `· 85% do limite`, `· limite atingido` ou `· cortada`). Erro = balão vermelho com
  a mensagem da API; falta de chave/modelo/limite oferece "Ir para Configurações".
- Um pedido por vez por robô; robôs diferentes trabalham ao mesmo tempo.
- `prefers-reduced-motion`: sem caminhada, piscadas e pulinhos — o robô aparece pensando na mesa.
- O resultado completo fica no [[Módulo Consumo]] (histórico).

## Pendências
- [ ] Animar também as execuções disparadas na tela de Automações (ex.: um sinal em `core/` ou polling do histórico).
- [x] Sala com até 8 mesas (duas fileiras, corredores livres) — Fase 5.

Criado em 2026-10-30.
