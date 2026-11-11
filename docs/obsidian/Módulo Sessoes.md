---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo Sessoes

As sessões reais do Claude Code (da assinatura) chegando ao vivo do PC do usuário: tokens de ingestão, eventos dos hooks e tokens/custo
da telemetria. Decisão: [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]. Voltar: [[00 - Dashboard]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Sessoes/AgentDesk.Modules.Sessoes` |
| Coletor (PC do usuário) | `src/AgentDesk.Web/coletor/agentdesk-coletor.mjs` (servido em `/coletor/agentdesk-coletor.mjs`) |
| App | `features/configuracoes/conexao-claude.component.ts` (conectar) · `features/escritorio/sala-claude-code.component.ts` (ao vivo) |
| Tabelas | `tokens_ingestao`, `cc_sessoes`, `cc_eventos` (90 dias), `cc_consumo_diario` (para sempre) |
| Testes | `tests/AgentDesk.IntegrationTests/Sessoes` · `coletor/agentdesk-coletor.spec.mjs` · `sessoes.store.spec.ts` · `motor/sessao.spec.ts` · `e2e/claude-code.spec.ts` |

## Como conectar (usuário)
1. **Configurações → Claude Code**: nome do computador → **Gerar token e comando** → copiar (Windows ou macOS/Linux).
2. Colar no terminal do PC (Node 18+). Ele baixa o coletor, faz backup do `~/.claude/settings.json`, adiciona hooks e telemetria e manda
   uma sessão de teste (sala "agentdesk-teste").
3. Abrir uma sessão **nova** do Claude Code → **Escritório → Claude Code (ao vivo)**.
4. **Pela IA:** Configurações → Claude Code → **Baixar guia para a IA (.md)** (`coletor/CONECTAR-COM-IA.md`, servido em `/coletor/`; o app troca `{{ENDERECO}}` pelo endereço do site). O dev abre o Claude Code e pede para ler o arquivo; a IA pede o token (que a pessoa gera) e instala.
5. Para tirar: `node ~/.agentdesk/agentdesk-coletor.mjs desinstalar` e revogar o token.

## Regras de negócio
- Status: `TRABALHANDO` (pedido/ferramenta), `ESPERANDO_VOCE` (aviso de permissão ou pergunta), `OCIOSA` (terminou/esperando o
  próximo pedido; ou sem sinal há 30 min), `ENCERRADA` (fim da sessão; some da sala depois de 15 min).
- Atividade do balão: "📖 Lendo api.ts", "✏️ Editando…", "📝 Escrevendo…", "💻 Rodando npm test", "🔎 Procurando…", "🌐 Abrindo
  docs.x.com", "👥 Chamando subagente…", "🗜️ Compactando o contexto", "🔌 Usando github" (MCP)…
- Sala = projeto (nome da pasta + hash do caminho completo: duas pastas "api" diferentes são duas salas), ou **um grupo** de salas que o usuário juntou. Até 8 robôs por sala; passando disso ficam os que trabalham ou esperam por você.
- No "ao vivo": sessões com atividade nas últimas 12 h.
- Evento fora de ordem (mais velho que a última atividade) entra na linha do tempo, mas não muda o status.
- Custo = `cost_usd` da telemetria (preço de tabela da API) — na assinatura, é o **equivalente**, não uma cobrança.

## Endpoints
| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/sessoes/tokens` | logado | 200 (sem o segredo) |
| POST | `/api/v1/sessoes/tokens` | logado | 201 `{ token, segredo }` · 400 · 409 `Sessoes.LimiteDeTokens` (10 ativos) |
| DELETE | `/api/v1/sessoes/tokens/{id}` | logado (dono) | 204 · 404 `Sessoes.TokenNaoEncontrado` |
| GET | `/api/v1/sessoes/ao-vivo` | logado | 200 salas e sessões |
| POST | `/api/v1/sessoes/eventos` | header `X-AgentDesk-Token` | 202 (evento desconhecido: aceito e ignorado) · 400 · 401 `Sessoes.TokenInvalido` |
| POST | `/api/v1/sessoes/otlp/v1/logs` | header `X-AgentDesk-Token` | 200 `{}` (OTLP/JSON, gzip ok) · 400 · 401 |

## Pendências
- [ ] Fase 6: painel de tokens das sessões (por projeto, modelo, ferramenta; cache; dicas de economia) e % das janelas de 5 h/semana.
- [ ] Codex (mesmo formato de evento).
- [ ] Aprovar permissões pelo Escritório (hook que espera a resposta).

Criado em 2026-10-30.

## Painel de tokens do Claude Code (Fase 6b-2)
Aba **Claude Code (assinatura)** na tela Consumo (`features/consumo/painel-claude-code.component.ts`), em cima de `cc_consumo_diario` e `cc_eventos`.

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| GET | `/api/v1/sessoes/painel?escopo=MEU\|TODOS&dias=30` | logado (`TODOS` só ADMIN) | 200 `PainelClaudeCodeDto` · 403 `Sessoes.SemPermissao` |

- Totais de **hoje, mês e acumulado** (tokens, ≈ US$, pedidos), série por dia (todos os dias da janela, de 7 a 90), ranking por **projeto** e por **modelo**.
- **Taxa de cache** = leitura ÷ (entrada + leitura + escrita), de 0 a 1. **Cache baixo** = abaixo de 60% com pelo menos 5 pedidos (`RegrasCache`): a tela destaca por projeto, modelo e dia.
- **Ferramentas**: contagem de `PreToolUse` (hooks, 90 dias). A telemetria informa tokens por pedido ao modelo, **não por ferramenta**: não há rateio.
- ≈ US$ é o que as chamadas custariam na API; na assinatura não se paga por token. Escopo TODOS soma todos os usuários.

## Dicas e histórico de sessões (Fase 6b-3)
Calculadas no servidor (`Domain/Dicas.cs`, funções puras testadas sem banco). Tela: `/consumo/sessoes` e o cartão de dicas na aba Claude Code.

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| GET | `/api/v1/sessoes/dicas?escopo=` | logado (`TODOS` só ADMIN) | 200 `DicasDto` · 403 `Sessoes.SemPermissao` |
| GET | `/api/v1/sessoes/historico?escopo=&projeto=&de=&ate=&pagina=&tamanho=` | logado | 200 `PaginaHistoricoSessoesDto` (90 dias, 20 por página, máx. 100) |
| GET | `/api/v1/sessoes/historico/{sessaoId}?escopo=` | dono (ADMIN com `TODOS`) | 200 `LinhaDoTempoDto` (até 1.000 eventos) · 404 `Sessoes.NaoEncontrada` |

**As 5 regras (últimos 7 dias)** — a economia é uma *estimativa grosseira* (fatia do custo da sessão), sempre rotulada assim:
| Regra | Dispara quando | Economia estimada |
|---|---|---|
| `CACHE_BAIXO` | sessão com 20+ pedidos e cache abaixo de 60% | custo × (80% − taxa) × 0,5 |
| `SESSAO_GIGANTE` | 150+ pedidos ou 20 mi+ de tokens | 25% do custo |
| `MUITAS_COMPACTACOES` | 3+ eventos `PreCompact` | 15% do custo |
| `MODELO_CARO` | Opus/Fable, 10+ pedidos e no máximo 3 edições de arquivo | 60% do custo |
| `DIA_FORA_DA_CURVA` | custo do dia > 2× a média dos outros dias com uso (3+ dias de uso, dia ≥ US$ 1) | custo do dia − média |

A linha do tempo agrupa hora a hora (Brasília) e esconde `PostToolUse` (ruído).

## Janelas de 5 h e da semana (Fase 6b-4)
Tabela `cc_limites` (usuário × janela). Decisão: [[ADR-013 - Janelas de Uso da Assinatura (Statusline)]].

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| POST | `/api/v1/sessoes/limites` | token de ingestão (`X-AgentDesk-Token`) | 202 · 400 (percentual fora de 0–100, nenhuma janela) · 401 `Sessoes.TokenInvalido` |
| GET | `/api/v1/sessoes/limites` | logado (só as próprias) | 200 `{ cincoHoras?, semana?, atualizadoEm? }` |

Coletor: modos `statusline` e `atualizar` (`src/AgentDesk.Web/coletor`). O painel (aba Claude Code) mostra as barras e quando renovam.

## Controle: Parar e Aprovar/Negar (Fase 6c)
Decisão: [[ADR-015 - Parar e Aprovar-Negar Sessões do Claude Code]]. Tabelas `cc_paradas` e `cc_permissoes`.

| Método | Rota | Acesso | Resposta / erros |
|---|---|---|---|
| POST | `/api/v1/sessoes/{sessaoId}/parar` | logado (dono) | 202 · 404 `Sessoes.SessaoNaoEncontrada` |
| POST | `/api/v1/sessoes/permissoes/{id}/decidir` | logado (dono) | 204 · 400 (`decisao` ≠ APROVAR/NEGAR) · 404 `Sessoes.PermissaoNaoEncontrada` (venceu) · 409 `Sessoes.PermissaoJaDecidida` |
| GET | `/api/v1/sessoes/controle/parada?sessaoId=` | token de ingestão | 200 `{ parar }` (consome o pedido) |
| POST | `/api/v1/sessoes/controle/permissoes` | token de ingestão | 201 `{ permissaoId, expiraEm }` · 409 `Sessoes.PermissoesPendentesDemais` |
| GET | `/api/v1/sessoes/controle/permissoes/{id}?espera=45` | token de ingestão | 200 `{ decisao }` (nulo = sem decisão) |

`GET /ao-vivo` ganha `permissaoPendente` e `pararSolicitado` por sessão. No app: cartão "✋ Pedidos de permissão" (todas as salas) com Aprovar/Negar,
e botão **Parar** na sessão selecionada.

## Claude Code na nuvem (ambiente remoto)
Os hooks do coletor vivem no `~/.claude/settings.json` **do computador onde o Claude Code roda**. Um ambiente de nuvem (ícone de nuvem no app Claude, ex.: `/home/user/<projeto>`) é outra máquina: não enxerga o seu PC, então não aparece no Escritório até ter o próprio coletor.

- Configurações → Claude Code → **Nuvem (Claude Code remoto)** gera dois blocos: as **variáveis de ambiente** (`AGENTDESK_URL`, `AGENTDESK_TOKEN`, `AGENTDESK_MAQUINA`) e o **script de preparação** (baixa o coletor e roda `instalar --sem-teste || true`).
- O coletor lê a conexão das variáveis (o token nunca vai na linha de comando); sem as variáveis, `instalar` pede `--url`/`--token`. `--sem-teste` pula a sessão de teste (ambientes sobem e descem toda hora).
- O ambiente precisa de **acesso de rede** ao endereço do AgentDesk. O token é pessoal: só nas variáveis do ambiente, nunca num repositório.
- A sala usa o nome da pasta do projeto na nuvem; o hash do caminho difere do local, então o mesmo projeto aparece como outra sala.

## Alertas no celular
Ao ingerir um evento `Stop` (sessão terminou) ou `Notification` de permissão/pergunta, e ao criar um pedido de permissão do hook síncrono, o módulo chama
`INotificador` ([[Módulo Notificacoes]]). Também implementa `IResumoEmAndamento` (sessões trabalhando agora) para o "ainda rodando" dos alertas. [[ADR-016 - Alertas no Celular (Push do App)]]

## Ajudantes, grupos de salas e lugar fixo (ADR-017)
- **Subagentes = robôs ajudantes.** Hooks com `agent_id` criam/atualizam uma linha em `cc_subagentes`; `GET /ao-vivo` traz `subagentes` (`agenteId`, `tipo`, `status` TRABALHANDO|ENCERRADA, `atividade`) em cada sessão. Terminou (`SubagentStop`) = some em ~20 s; `SessionEnd` fecha todos; sem sinal há 10 min = some. Evento sem `agent_id` (coletor antigo) continua só como balão da sessão.
- **Grupos:** `PUT /api/v1/sessoes/grupos` `{ projetoChave, grupo }` (grupo vazio tira) · 204 · 400 · 409 `Sessoes.LimiteDeGrupos` (100 salas). `ProjetoAoVivoDto.grupo` diz a qual grupo o projeto pertence. No app: "Juntar salas" no painel da sala e a sugestão "Há outra sala chamada…" quando duas pastas têm o mesmo nome.
- **Lugar fixo:** `cc_sessoes.lugar` (0–7) vem do servidor e liga a sessão ao agente da Equipe `(projetoChave, ordem)`. `SessaoAoVivoDto` traz `projetoChave` e `lugar`.
- **Atualizar o coletor** para mandar `agenteId`/`agenteTipo`: `node ~/.agentdesk/agentdesk-coletor.mjs atualizar`.
- Testes: `SessoesTests` (subagentes, grupos, lugar) · `salas.spec.ts` · `sessoes.store.spec.ts` · `e2e/claude-code.spec.ts` · `agentdesk-coletor.spec.mjs`.

## Mandar tarefa para o Claude Code do PC (ADR-018)
O app manda uma tarefa e o coletor do PC abre `claude -p` nela. **Quem libera a pasta é o usuário, no PC** (`agentdesk-coletor liberar`); o caminho nunca sai do computador.

**Como usar** (no computador, uma vez): `node ~/.agentdesk/agentdesk-coletor.mjs liberar` dentro da pasta do projeto e `… escutar` (deixar aberto; Windows PowerShell: `$HOME` no lugar de `~`; `--claude CAMINHO` se o `claude` não estiver no PATH).
No app: **Escritório → Claude Code (ao vivo) → Mandar tarefa**: computador, pasta, texto, *Enviar tarefa*. O robô da tarefa aparece na sala do projeto (mesmo id da sessão).

| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/sessoes/computadores` | logado | 200 `ComputadorDto[]` (`online` = sinal nos últimos 45 s; `pastas` = nome e chave) |
| POST | `/api/v1/sessoes/tarefas` | logado | 201 `TarefaDto` · 400 · 404 `Sessoes.PastaNaoLiberada` · 409 `Sessoes.LimiteDeTarefas` (5 abertas) |
| GET | `/api/v1/sessoes/tarefas` | logado | 200 últimas 20 (`PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`, `FALHOU`, `CANCELADA`, `EXPIRADA`) |
| POST | `/api/v1/sessoes/tarefas/{id}/cancelar` | logado (dono) | 204 · 404 `Sessoes.TarefaNaoEncontrada` · 409 `Sessoes.TarefaJaIniciada` (depois de começar: **Parar** no robô) |
| PUT | `/api/v1/sessoes/controle/pastas` | token de ingestão | 204 · 400 · 401 (substitui a lista do computador e marca o sinal) |
| GET | `/api/v1/sessoes/controle/tarefas?maquina=&limite=` | token | 200 (cada tarefa sai uma vez; já fica `EM_ANDAMENTO`) |
| POST | `/api/v1/sessoes/controle/tarefas/{id}/resultado` | token | 204 · 400 · 404 (`{ maquina, status: CONCLUIDA\|FALHOU, erro }`) |

Regras: texto de 1 a 4000 caracteres; máx. 5 tarefas abertas por usuário; pendente há mais de 10 min = `EXPIRADA` (não é mais entregue); em andamento há mais de 6 h = `FALHOU`.
Tabelas `cc_pastas_liberadas` e `cc_tarefas`. Testes: `TarefasTests` (backend) · `tarefas.store.spec.ts` · `e2e/claude-code.spec.ts` · `agentdesk-coletor.spec.mjs` (inclui o `escutar` de verdade contra um `claude` de mentira).
**Não testado com o `claude` real** (só o de mentira). Nuvem e sessão já aberta (canal) ficam para depois.

