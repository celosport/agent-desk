---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo Equipe

Nome e aparência (cores, acessório, antena, expressão) dos agentes de cada usuário. Decisão: [[ADR-011 - Equipe Personalizada (Nome e Aparência dos Agentes)]].
Voltar: [[00 - Dashboard]] · Receita: [[Receita - Novo Módulo (API + App)]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Equipe/AgentDesk.Modules.Equipe` |
| App | `src/AgentDesk.Web/src/app/features/escritorio` — aba **Equipe** (`equipe.component.ts`, `robo-previa.component.ts`), `data-access/equipe.*`; robô em camadas em `motor/personagens.ts` (`montarSprite`) |
| Tabelas | `agentes_personalizados` |
| Testes | `tests/AgentDesk.IntegrationTests/Equipe` · `e2e/equipe.spec.ts` · `equipe.store.spec.ts` · `motor/camadas.spec.ts` |

## Regras de negócio
- Identidade: `(usuário, alvo, chave, ordem)`. `AUTOMACAO` exige ordem 0; `PROJETO` aceita 0 a 7.
- Nome de 1 a 20 caracteres; cores `#rrggbb`; acessório/antena/expressão de listas fechadas (padrões: `NENHUM`, `RETA`, `NORMAL`).
- Cada usuário só vê e altera os próprios agentes.

## No app
- Aba **Equipe** do Escritório: escolhe automação ou projeto (+ posição 1º a 8º), edita nome, 4 cores (paletas prontas ou cor livre), acessório, antena e expressão, com pré-visualização ao vivo; "Restaurar padrão" apaga a personalização.
- Robô montado em camadas por código (corpo fixo + antena + expressão + acessório), ainda em pixel art original.
- Sessões do Claude Code: a posição do robô na sala (0 a 7, a ordem de chegada) escolhe o agente da equipe do projeto; sem agente naquela posição, vale o nome/cor automáticos.
- Falha ao carregar a equipe não derruba o Escritório (segue com o padrão).
- Pendente: clicar num robô na sala e escolher "Personalizar" (hoje se edita pela aba Equipe).

## Endpoints
| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/equipe` | logado | 200 `AgenteDto[]` |
| PUT | `/api/v1/equipe` | logado | 200 `AgenteDto` (cria ou atualiza) · 400 |
| DELETE | `/api/v1/equipe/{alvo}/{ordem}?chave=` | logado | 204 · 404 `Equipe.AgenteNaoEncontrado` |
