---
tags: [migracao]
---
# 🔁 Migração do Base44

Checklist para trazer um app do Base44 para esta arquitetura. Voltar: [[00 - Dashboard]] · Perguntas: [[Perguntas para Novo Projeto]]

Objetivo: tirar o app do Base44 (banco e código presos) e rodar em **Angular (ou React) + API .NET + PostgreSQL**, com ambientes de **desenvolvimento, homologação e produção** separados.

## 1. O que reunir (me envie isto)
- [ ] **Código do app**: sincronizar com o GitHub (se o plano permitir) ou baixar/exportar. Se não der, copie as pastas de `entities/` (definições das entidades), as telas principais e as funções de backend.
- [ ] **Entidades**: para cada uma, os campos e os tipos, e quais apontam para outras (relações).
- [ ] **Dados de amostra**: exporte cada entidade em CSV ou JSON (10–50 linhas bastam para começar; o export completo vem na etapa de importação).
- [ ] **Perfis e permissões**: quem entra no sistema (ex.: administrador, técnico, gestor) e o que cada um pode ver e fazer.
- [ ] **Telas**: lista das telas e do fluxo principal (prints ajudam).
- [ ] **Anexos**: existe upload? Tipos (foto, PDF), tamanho médio e quantidade.
- [ ] **Integrações**: e-mail, WhatsApp, IA, pagamento, relatórios em PDF/Excel.
- [ ] **Regras que não estão óbvias** no código (cálculos, prazos, status, notificações).
- [ ] **Usuários existentes**: quantos e como entram hoje (e-mail e senha, Google).

## 2. Etapas
1. **Modelo relacional** (tabelas, chaves, relacionamentos) → você aprova. *(é a decisão mais cara de errar)*
2. **Ambientes** no Railway: `developer`, `homolog` e `producao`, cada um com seu banco e suas variáveis.
3. **Back-end**: um módulo por área, com testes de integração.
4. **Front**: telas no `src/AgentDesk.Web` (padrão [[Frontend (Angular PWA)]]); o SDK do Base44 vira um `*.api.ts` por feature que chama a nossa API.
5. **Importação dos dados** (CSV → PostgreSQL) em desenvolvimento e depois em homologação.
6. **Validação** tela por tela em homologação, com dados reais importados.
7. **Corte**: avisar os usuários, importar de novo em produção, apontar o domínio e só então desligar o Base44.

## 3. Regras para não se arrepender
- O Base44 **continua no ar** até o corte. Nada é desligado antes da validação.
- Nada de teste em produção: toda mudança passa por desenvolvimento e homologação.
- **Segredos fora do Git** (senhas de banco, chaves). Girar a senha se algo vazar.
- Senhas do Base44 **não são exportáveis**: os usuários definem senha nova ("esqueci minha senha").
- Backup do banco de produção **antes** de qualquer migração de schema.
