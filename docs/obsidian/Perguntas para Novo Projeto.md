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
