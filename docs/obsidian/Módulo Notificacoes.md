---
tags: [modulo]
status: em-andamento
---
# 🧩 Módulo Notificacoes

Alertas push no celular: aparelhos inscritos, o que avisar e o envio. Decisão: [[ADR-016 - Alertas no Celular (Push do App)]].
Voltar: [[00 - Dashboard]] · Receita: [[Receita - Novo Módulo (API + App)]]

| Camada | Onde |
|---|---|
| API | `src/Modules/Notificacoes/AgentDesk.Modules.Notificacoes` |
| App | `features/configuracoes` (cartão "Alertas no celular": `alertas-celular.component.ts`, `data-access/alertas.*`, `push-navegador.ts`) |
| Contrato | `SharedKernel/Contratos/Notificacoes.cs`: `INotificador`, `IResumoEmAndamento`, `TipoAlerta` |
| Tabelas | `notificacoes_dispositivos`, `notificacoes_preferencias`, `notificacoes_vapid` |
| Testes | `tests/AgentDesk.IntegrationTests/Notificacoes` · `alertas.store.spec.ts` · `e2e/alertas-celular.spec.ts` |

## Quem dispara
| Origem | Alerta | Tipo (preferência) |
|---|---|---|
| Automacoes (`ExecutarAutomacao`) | "✅ {nome} concluída" / "⚠️ {nome} falhou" (não avisa se o usuário cancelou) | Automação |
| Sessoes (evento `Stop`) | "✅ {projeto} terminou" | Sessão |
| Sessoes (`Notification` de permissão/pergunta e pedido de permissão do hook) | "✋ ... precisa de você" | Permissão |

O alerta traz "Ainda rodando: ..." com as linhas de `IResumoEmAndamento` (Sessoes: sessões trabalhando; Automacoes: execuções em andamento).

## Endpoints (`api/v1/notificacoes`, logado)
| Método | Rota | Resposta / erros (`code`) |
|---|---|---|
| GET | `/` | 200 chave pública VAPID + aparelhos + preferências |
| POST | `/dispositivos` | 200 · 400 (endereço não é de um serviço de push conhecido) · 409 `Notificacoes.DispositivosDemais` (máx. 10) |
| POST | `/dispositivos/remover` | 204 (também se já não existia) |
| PUT | `/preferencias` | 200 |
| POST | `/teste` | 200 `{ entregues }` · 409 `Notificacoes.SemDispositivos` · 503 `Notificacoes.NaoEntregue` |

## Regras
- Mesmo endpoint = mesmo aparelho (atualiza em vez de duplicar). Aparelho que o serviço de push diz que sumiu (404/410) é apagado; falha passageira não apaga.
- Chaves VAPID: geradas na primeira chamada e guardadas no banco (ou o par pode ser trocado no futuro por configuração).
- `INotificador` nunca lança e tem prazo de 10 s.
