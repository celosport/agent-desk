---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo Automacoes

Fluxos de 1 clique que chamam a API da Claude **pelo servidor**, com a chave do usuário, e gravam o consumo de cada chamada.
Voltar: [[00 - Dashboard]] · Receita: [[Receita - Novo Módulo (API + App)]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Automacoes/AgentDesk.Modules.Automacoes` |
| Contratos usados | `IConfiguracoesDeUso`, `IRegistroConsumo`, `IClienteAnthropic` · [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]] |
| App | `src/AgentDesk.Web/src/app/features/automacoes` (`automacoes.page.ts` + `editar-automacao.component.ts`) |
| Tabelas | `automacoes` (e grava em `consumo_chamadas`, do [[Módulo Consumo]]) |
| Testes | `tests/AgentDesk.IntegrationTests/Automacoes` · `e2e/automacoes.spec.ts` · `automacoes.store.spec.ts` · `shared/util/arquivos.spec.ts` |

## Regras de negócio
- Três fluxos na carga inicial (uma vez só): **Gerar Relatório Executivo** (Opus 5.5, 8.000 tokens), **Analisar Código** (Opus 5.5, 8.000)
  e **Resumir Documento** (Haiku 5.5, 4.000). O `codigo` (`relatorio-executivo`…) é estável: o Escritório (Fase 4) usa.
- Cada fluxo = prompt de sistema + modelo de mensagem com `{{entrada}}` (obrigatório; `CHECK` no banco e validação na API).
- **Modelo usado:** o escolhido na execução → o da automação → o padrão do usuário. Precisa estar **ativo** na tabela de modelos.
- **Entrada:** texto colado ou arquivo .txt/.md lido no navegador; até **200 KB** em UTF-8. A entrada **não é guardada**; o resultado sim.
- **Limite mensal** (America/Sao_Paulo): conferido **antes** da chamada. Gasto ≥ limite e "bloquear" → 422 sem chamar a Claude.
  Depois da chamada, a resposta traz `alertaLimite` quando o gasto do mês passa de 80%.
- **Recusa** do filtro de segurança: grava RECUSADA com os tokens cobrados e responde 422. Com `fallback_recusa` no modelo, a Anthropic
  tenta outro modelo antes; o custo usa o preço de quem respondeu. → [[ADR-006 - Integração com a API da Anthropic]]
- Erro da Anthropic: grava ERRO (custo 0, com o `erro_codigo`) e devolve o código estável.
- Só o ADMIN edita os fluxos; inativos somem para os usuários.

## Endpoints
| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/automacoes` | logado (ADMIN vê inativas) | 200 `AutomacaoDto[]` |
| PUT | `/api/v1/automacoes/{id}` | ADMIN | 200 · 400 (`modeloMensagem` sem `{{entrada}}`…) · 403 · 404 `Automacoes.NaoEncontrada` · 422 `Automacoes.ModeloInvalido` |
| POST | `/api/v1/automacoes/{id}/executar` | logado | 200 `ExecucaoDto` · 400 (`entrada`, `nomeArquivo`) · 404 · 422 `Automacoes.ChaveNaoConfigurada` / `ModeloNaoDefinido` / `ModeloInvalido` / `LimiteMensalAtingido` / `Recusada` / `Anthropic.ChaveInvalida` / `Anthropic.SemCredito` / `Anthropic.PedidoInvalido` · 503 `Anthropic.LimiteDeTaxa` / `Anthropic.Indisponivel` |
| POST | `/api/v1/automacoes/execucoes/{execucaoId}/cancelar` | logado (dono) | 204 · 404 `Automacoes.ExecucaoNaoEncontrada` — a execução original responde 422 `Automacoes.Cancelada` ([[ADR-012 - Cancelar Tarefa do Agente]]) |

## Telas
- **Automações** (`/automacoes`): cartões dos fluxos, texto ou arquivo, modelo, Executar; resultado com tokens, custo, duração,
  **Copiar** e **Baixar .md** (`<codigo>-AAAA-MM-DD-HHMM.md`, hora de Brasília). Falta de chave/modelo/limite leva para Configurações.
- ADMIN: **Editar fluxo** na própria tela.

## Pendências
- [ ] Streaming (a resposta hoje chega de uma vez; o balão "pensando…" do Escritório cobre a espera).
- [ ] Fluxos criados pelo próprio usuário.

Criado em 2026-10-30.

## Cancelar e tempos (Fase 6b-1)
- Escritório: enquanto o agente trabalha aparece **Cancelar** e o cronômetro "trabalha há 12 s"; depois, "Última execução: 08:15:02 → 08:15:09 · 7 s". O histórico mostra início → fim e o status **Cancelada**.
- `execucaoId` vai no `executar`; `finalizadaEm` = início + duração (DTO). Sessões do Claude Code mostram "iniciada às HH:mm:ss · duração" (ou início → fim, se encerrada). O topo do app mostra quem está logado.

## Alertas no celular
`ExecutarAutomacao` avisa pelo `INotificador` ([[Módulo Notificacoes]]) quando a execução termina com sucesso, falha ou é recusada; **cancelada pelo usuário não avisa**.
A execução sai do registro `IExecucoesEmAndamento` antes do aviso, para o "ainda rodando" não listar a si mesma; o registro agora guarda o nome da automação
(`Iniciar(id, usuario, rotulo)`) e implementa `IResumoEmAndamento`. [[ADR-016 - Alertas no Celular (Push do App)]]
