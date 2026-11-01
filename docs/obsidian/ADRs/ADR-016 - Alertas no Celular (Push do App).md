---
tags: [adr]
---
# ADR-016 — Alertas no celular (push do app instalado)

- **Status:** aceita
- **Data:** 2026-11-01

## Contexto
O usuário deixa tarefas rodando (automações e sessões do Claude Code, inclusive na nuvem) e quer **ser avisado no celular quando terminarem**,
com o resumo do que ainda está rodando. O AgentDesk já é um PWA; a pergunta era qual canal usar.

## Decisão
- **Web Push (VAPID) do próprio app**, sem conta de terceiros (Telegram, ntfy...). Respostas do usuário: canal = push do app; eventos =
  automação terminou/falhou, sessão do Claude Code terminou, Claude Code pediu permissão; conteúdo = resumo do que ainda está rodando.
- **Módulo `Notificacoes`** (tabelas `notificacoes_dispositivos`, `notificacoes_preferencias`, `notificacoes_vapid`). Outros módulos não o
  conhecem: chamam `INotificador` (SharedKernel) e quem sabe o que está rodando implementa `IResumoEmAndamento` (Sessoes e Automacoes).
  Mesma regra do [[ADR-008 - Contratos entre Módulos (Automacoes, Configuracoes e Consumo)]].
- **Quando avisa:** automação concluída ou com falha (cancelada pelo usuário **não** avisa); `Stop` da sessão (terminou); `Notification`
  de permissão/pergunta e o pedido de permissão do hook síncrono ([[ADR-015 - Parar e Aprovar-Negar Sessões do Claude Code]]).
  Alertas do mesmo assunto trocam o anterior no aparelho (`tag`).
- **"Ainda rodando":** até 3 linhas ("pulse-fit: ✏️ Editando api.ts · Automação Resumir Documento") + "+N". Só metadados que já estão no app.
- **Chaves VAPID geradas pelo servidor** na primeira vez e guardadas em `notificacoes_vapid` (linha única): quem roda por conta própria
  não precisa configurar nada. Assunto (`Notificacoes__Assunto`, `mailto:` ou `https://`) é opcional; a Apple pode exigir um válido.
- **Preferências por tipo** (tudo ligado até o usuário desligar) e até **10 aparelhos** por usuário; o aparelho que o serviço de push
  diz que não existe mais (404/410) é apagado sozinho.
- **Segurança:** o servidor faz uma requisição para o endereço que o app informa, então só serviços de push conhecidos entram
  (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`), sempre `https` na porta 443 —
  senão o campo seria um jeito de fazer o servidor acessar endereços internos (SSRF).
- **Nunca derruba quem chama:** `INotificador` não lança exceção e tem prazo de 10 s; falha de push só vai para o log (tipo do erro).
  O alerta usa `CancellationToken.None` de propósito: o caso típico é o usuário ter fechado a aba.

## Consequências
- iPhone/iPad: só funciona com o app instalado na Tela de Início (iOS 16.4+); a tela de Configurações explica.
- O service worker do Angular (`ngsw`) mostra o alerta e abre o Escritório ao tocar: o payload segue o formato `{ notification: ... }`.
- O envio real é testado contra um serviço de push falso em memória (criptografia + VAPID); o resto dos testes troca o envio por `PushFalso`.
  Em E2E o navegador é falso (`PushNavegadorFalso`): o Chrome sem cabeça não alcança um serviço de push de verdade.
- Não verificado com um celular real nesta fase: o primeiro teste é o botão "Enviar alerta de teste" em Configurações.
