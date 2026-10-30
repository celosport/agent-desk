---
tags: [modulo]
status: pronto
---
# 🧩 Módulo Consumo

Log de cada chamada à API da Claude (tokens, custo, duração, status), com painel atualizado por polling e histórico filtrável.
Voltar: [[00 - Dashboard]] · Receita: [[Receita - Novo Módulo (API + App)]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Consumo/AgentDesk.Modules.Consumo` |
| Contratos | oferece `IRegistroConsumo`; usa `IConfiguracoesDeUso` (limite) e `IDiretorioUsuarios` (nomes) · [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]] |
| App | `src/AgentDesk.Web/src/app/features/consumo` (`painel.page.ts`, `historico.page.ts`, `grafico-dias.component.ts`) |
| Tabelas | `consumo_chamadas` |
| Testes | `tests/AgentDesk.IntegrationTests/Consumo` · `e2e/consumo.spec.ts` · `consumo.util.spec.ts` · `consumo.stores.spec.ts` |

## Regras de negócio
- Uma linha por chamada: data (UTC), automação (id + nome da época), modelo pedido e modelo que respondeu, tokens de entrada, saída,
  leitura e escrita de cache, `tokens_total` (coluna gerada), **preços usados** (congelados), custo em US$ (6 casas), duração em ms,
  status `SUCESSO` / `ERRO` / `RECUSADA`, `erro_codigo`, `motivo_parada` (stop_reason), nome do arquivo e o **resultado**.
  A entrada do usuário **não** é guardada.
- **Hoje** e **este mês** contam no fuso de Brasília (`FusoBrasil` + `AT TIME ZONE 'America/Sao_Paulo'` no SQL); o "agora" vem do `TimeProvider`.
- Gráfico e ranking: janela de `dias` (padrão 30, de 7 a 90) terminando hoje; todos os dias aparecem, inclusive os zerados.
  Ranking do mais caro para o mais barato, agrupado pela automação (nome mais recente).
- Escopo `MEU` (padrão) = só o usuário do token. `TODOS` = soma de todos, **só ADMIN** (403 `Consumo.SemPermissao`), com o nome de
  quem rodou. O limite mensal só aparece no `MEU`.
- Detalhe de uma chamada: o dono, ou o ADMIN. Chamada de outro = 404 (não revela que existe).

## Endpoints
| Método | Rota | Acesso | Resposta / erros (`code`) |
|---|---|---|---|
| GET | `/api/v1/consumo/resumo?escopo=&dias=` | logado (`TODOS`: ADMIN) | 200 `ResumoConsumoDto` · 403 `Consumo.SemPermissao` |
| GET | `/api/v1/consumo/chamadas?escopo=&de=&ate=&automacaoId=&modeloId=&status=&pagina=&tamanho=` | logado (`TODOS`: ADMIN) | 200 `PaginaChamadasDto` (com totais do filtro) · 400 (`de` > `ate`) · 403 |
| GET | `/api/v1/consumo/chamadas/{id}` | dono ou ADMIN | 200 `ChamadaDetalheDto` (resultado + preços) · 404 `Consumo.ChamadaNaoEncontrada` |
| GET | `/api/v1/consumo/filtros?escopo=` | logado (`TODOS`: ADMIN) | 200 automações e modelos que aparecem no consumo |

`de`/`ate` são dias de Brasília (`2026-10-30`), ambos inclusos. `modeloId` casa com o modelo pedido **ou** o que respondeu (fallback).
Tamanho da página: padrão 20, máximo 100.

## Telas
- **Consumo** (`/consumo`): KPIs (hoje, mês, acumulado), barra do limite do mês (alerta ≥ 80%, estourado ≥ 100%), custo por dia
  (SVG puro, uma série na cor `--ui-grafico` validada nos dois temas, tooltip no hover e no foco do teclado, "Ver como tabela")
  e ranking por automação. Polling de 10 s com `core/tempo-real` (pausa com a aba escondida; falha mantém os números e mostra o aviso).
  ADMIN: "Meu consumo" × "Todos os usuários".
- **Histórico** (`/consumo/historico`): filtros, totais do filtro, tabela (cartões no celular), paginação e "Ver resultado"
  (copiar / baixar .md).

## Pendências
- [ ] Exportar o histórico em CSV.
- [ ] Filtros do histórico na URL (para compartilhar o link).

Criado em 2026-10-30.
