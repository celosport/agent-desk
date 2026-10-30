---
tags: [projeto, decisoes]
---
# ❓ Perguntas para Novo Projeto

Perguntas-chave para transformar o esqueleto no **seu** produto. As respostas decidem o que entra (e o que não entra) no código.
- O script `scripts/novo-projeto.sh` faz as perguntas 🅢 e já aplica o que dá (nome, nome de exibição, descrição, cor, portas).
- As demais ficam para a primeira sessão com o Claude Code: o `CLAUDE.md` manda ele ler esta nota e **perguntar o que estiver em branco antes do primeiro módulo**.
- Cada resposta que vira decisão importante ganha um ADR (`_Modelos/Modelo - ADR`).

Voltar: [[00 - Dashboard]]

## Respostas deste projeto
<!-- RESPOSTAS:INICIO (preenchido pelo novo-projeto.sh em 2026-10-30; edite à vontade) -->
| Pergunta | Resposta |
|---|---|
| Nome técnico (PascalCase) | AgentDesk |
| Nome de exibição | Agent Desk |
| Descrição em uma frase | Painel de consumo e automações com a API da Claude, com escritório animado dos agentes |
| Perfis além de USUARIO/ADMIN | nenhum |
| Módulos de negócio iniciais | Configuracoes,Automacoes,Consumo |
| Manter o exemplo Tarefas | sim |
| Funciona offline | não |
| Plano pago (Free × Pro) | não |
| App nas lojas (Capacitor) | não |
| Cor da marca | #3b5bdb |
| Portas (API https/http · app · PostgreSQL) | 52480 / 52481 · 4210 · 5434 |
| Dono da API key da Anthropic | **Cada usuário** cadastra a sua (criptografada) → [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]] |
| Dono dos dados de consumo | **Por usuário**; o ADMIN tem a visão "Todos" (consolidado) |
| Cadastro | Público (como o módulo Contas já faz); ADMIN promovido por `database/manutencao/promover-admin.sql` |
| Limite de gasto | Opcional por usuário, em US$/mês: aviso a 80% e bloqueio a 100% (ou "só avisar") → [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]] |
| Preço no histórico | **Congelado** no log no momento da chamada |
| Tokens de cache | Gravados (`cache_read` / `cache_creation`), com preço opcional na tabela de modelos |
| Tabela de modelos | No banco, editável pelo ADMIN; carga inicial única (`migracoes_dados`) com Fable 5.1, Opus 5.5, Sonnet 5.5 e Haiku 5.5 |
| Automações | Tabela `automacoes` (prompt-modelo, modelo padrão, `max_tokens`) editável pelo ADMIN; usuário pode trocar o modelo na execução. Fluxos do usuário: depois |
| Arquivo de entrada | .txt/.md lido no navegador e enviado como texto; até 200 KB; arquivo não é guardado |
| O que se guarda da execução | A **resposta** (para reabrir no histórico) e os metadados; a entrada não |
| Streaming | Não na Fase 2: resposta completa, timeout de 120 s |
| Uso principal | Computador (menu lateral/topo); responsivo no celular; Escritório simplificado no celular |
| Tempo real | Polling de 10 s (`core/tempo-real`); dia e mês no fuso America/Sao_Paulo |
| Exemplo Tarefas | ✅ Removido na Fase 2 (API, app, tabela, testes, E2E e nota) |
| Integração com a Claude | HttpClient na Infrastructure, contrato no SharedKernel, falso nos testes → [[ADR-006 - Integração com a API da Anthropic]] |
| Recusa do filtro de segurança | Fallback da Anthropic (`fallbacks: "default"`) ligado por modelo (`fallback_recusa`); recusa final grava RECUSADA com os tokens |
| Git | `main` + uma branch por fase (`feat/fase-N-...`) |
| **Modo Claude Code** (pedido em 2026-10-30, inspirado no Habblaud) | Acompanhar as sessões reais do Claude Code (assinatura) no Escritório e no Consumo → [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]] |
| Onde os eventos chegam | No AgentDesk do **Railway** (HTTPS + token de ingestão por usuário); funciona de qualquer máquina |
| Codex | Fora por agora; formato de evento preparado para incluir depois |
| O que sai do PC | Só **metadados** (projeto, ferramenta, arquivo/comando resumido, tokens, custo); **sem código e sem texto dos prompts** |
| Várias máquinas | Sim: cada máquina com um nome, mesmo token |
| Automações via API | Continuam; o painel separa "Sessões do Claude Code (assinatura)" de "Automações (API)" |
| Ordem | Fase 5: ingestão + Escritório ao vivo · Fase 6: painel de tokens + dicas · Fase 7: moedas |
| Retenção | Eventos detalhados 90 dias; totais por dia/projeto/modelo para sempre |
<!-- RESPOSTAS:FIM -->

## 1. Produto e negócio
- [ ] 🅢 **Nome técnico** (PascalCase, vira namespace C#) e **nome de exibição** (com acentos, vai na tela e no ícone).
- [ ] 🅢 **O que o produto faz, em uma frase?** Para quem é?
- [ ] Qual o **fluxo principal** (o que o usuário faz 80% do tempo)? Liste as 3–5 telas principais.
- [ ] Quais **regras de negócio** não são óbvias (cálculos, prazos, status, limites)?
- [ ] Existe **plano pago** (Free × Pro)? O que fica bloqueado? → gate `[ExigePlanoX]` na API + selo "Pro" no menu ([[Frontend (Angular PWA)]]).

## 2. Usuários e acesso
- [ ] 🅢 **Perfis** além de `USUARIO` e `ADMIN` (ex.: `CLIENTE`, `PROFISSIONAL`)? Cada perfil tem uma **área** diferente no app?
  → enum `PerfilUsuario` + `Perfis` (SharedKernel), `CHECK` em `usuarios.tipo_perfil`, `Perfil` em `auth.models.ts` e `rotaInicial()` nos guards.
- [ ] Cadastro é **público** ou por **convite**? Precisa de "esqueci minha senha" (→ e-mail)?
- [ ] Os dados são **por usuário**, **por empresa/equipe** (multi-inquilino) ou compartilhados? *(decisão cara de mudar depois)*
- [ ] Precisa de área de **administração geral** (bloquear conta, ver todos)?

## 3. Módulos e dados
- [ ] 🅢 **Módulos de negócio iniciais** (um por área: ex.: `Clientes`, `Agenda`, `Financeiro`).
- [ ] 🅢 **Manter o módulo de exemplo `Tarefas`?** (recomendado manter até o primeiro módulo real existir, depois remover API + app + tabela + testes).
- [ ] Para cada módulo: entidades, campos, relações e quem é o **dono** do dado (filtro por `IUsuarioAtual`).
- [ ] Haverá **migração de dados** de um sistema antigo? → [[Migração do Base44]].
- [ ] **Uploads** (fotos, PDFs)? Tamanho, quantidade, privados ou públicos?

## 4. Frontend
- [ ] 🅢 **Cor da marca** (hex) → `--ui-marca` em `styles.scss` e `theme_color` no manifest.
- [ ] Uso principal no **celular**, no **computador** ou nos dois? (define navegação: abas inferiores × menu lateral)
- [ ] Precisa funcionar **offline** (fila de sincronização + API idempotente com id gerado no cliente)?
- [ ] Precisa de **tempo real** (polling já vem pronto em `core/tempo-real`; WebSocket só se o polling não bastar)?
- [ ] Vai para as **lojas** (Android/iOS com Capacitor) ou só PWA? *(padrão: só PWA)*
- [ ] Páginas **públicas** sem login (vitrine, apresentação, política de privacidade)?
- [ ] Tema **claro/escuro** (já vem) — qual é o padrão?

## 5. Integrações
- [ ] **E-mail** (Brevo/SMTP; Mailpit local já vem no docker-compose)?
- [ ] **Pagamentos** (Pix, cartão, assinatura recorrente)?
- [ ] **Avisos no celular** (Web Push / FCM)?
- [ ] **WhatsApp**, **IA**, mapas, relatórios em PDF/Excel?

## 6. Infra e operação
- [ ] 🅢 **Portas locais** (API https/http, app, PostgreSQL) — mude se vai rodar mais de um projeto ao mesmo tempo.
- [ ] Ambientes no Railway: `developer`, `homolog`, `producao`? Domínio próprio? → [[Deploy (Railway)]].
- [ ] **LGPD**: dados sensíveis (saúde, localização, documentos)? Precisa de consentimento e de "excluir minha conta"?
- [ ] Idioma e fuso: só **pt-BR / America/Sao_Paulo** (padrão)?

## Depois de responder
1. Registre as respostas na tabela acima.
2. Decisões grandes → ADR em `ADRs/` e link no [[00 - Dashboard]].
3. Peça ao Claude Code: *"Aplique as respostas da nota Perguntas para Novo Projeto"* — ele ajusta perfis, módulos e telas seguindo o `CLAUDE.md`.
