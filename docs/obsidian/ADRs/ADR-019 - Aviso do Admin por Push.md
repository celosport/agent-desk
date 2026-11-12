---
tags: [adr]
---
# ADR-019 — Aviso do Admin por Push (convite para instalar o app)

- **Status:** aceita
- **Data:** 2026-11-12

## Contexto
O app é um PWA. Quem o instala recebe os alertas de [[ADR-016 - Alertas no Celular (Push do App)]], mas o ADMIN precisava de um jeito de
chamar os usuários para instalar. Não há envio de e-mail no sistema; o canal escolhido foi o push do próprio app.

## Decisão
- **Instalação como primeira etapa do cadastro** no celular/tablet (`core/nativo`: `InstalarApp` captura o `beforeinstallprompt`; iPhone/iPad
  mostram o passo a passo). Sem suporte (computador) ou já instalado: o cadastro abre direto. Nunca bloqueia a conta. No login o cartão
  tem "Agora não" (adia 3 dias, `localStorage`).
- **Aviso do ADMIN** (módulo `Notificacoes`): `GET /api/v1/notificacoes/admin/destinatarios` (usuários + nº de aparelhos com alertas) e
  `POST /api/v1/notificacoes/admin/aviso` (`usuarioIds` ou `null` = todos; título, mensagem e `url`). Só `ADMIN`.
- **Nomes e e-mails** vêm do contrato `IDiretorioUsuarios.ListarAsync` (SharedKernel, implementado por Contas): Notificacoes não lê `usuarios`.
- O aviso **ignora as preferências por tipo** (é um comunicado, não um alerta de tarefa) e a resposta diz quantas pessoas foram alcançadas,
  quantas **não têm alertas ativos** e quantas falharam. Um aparelho com falha não impede os outros.
- `url` só aceita caminho do próprio app (`/...`, nunca `//` nem endereço externo).

## Consequências
- Quem ainda não ativou os alertas **não recebe** o push; a tela do ADMIN marca essas pessoas como "sem alertas". Para elas, o caminho é
  mandar o link por outro meio.
- Não verificado em celular real: a instalação e o push dependem de HTTPS e de um aparelho com o app aberto ao menos uma vez.
