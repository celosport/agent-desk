---
tags: [adr, documentacao]
---
# ADR-004 — Documentação como cofre do Obsidian dentro do repositório

- **Status:** aceita

## Contexto
A documentação precisa ser lida por gente (no Obsidian, com grafo e backlinks) e pelo Claude Code (arquivos `.md` no repositório),
e precisa mudar no **mesmo commit** do código que ela descreve.

## Decisão
- O cofre fica em **`docs/obsidian/`** (abrir essa pasta como cofre no Obsidian). Configuração versionada em `.obsidian/`
  (exceto `workspace.json`, que muda a cada uso e está no `.gitignore`).
- Notas com **wikilinks** (`[[` + nome da nota + `]]`); nomes de arquivo legíveis, com acentos. ADRs em `ADRs/`, modelos em `_Modelos/`.
- Entrada única: **[[00 - Dashboard]]** (mapa, tabela de módulos e histórico). Projeto novo começa por [[Perguntas para Novo Projeto]].
- Código pode citar notas em comentários (`[[ADR-003 - Frontend Junto da API (SPA Proxy)]]`) para ligar código ↔ decisão.
- O `CLAUDE.md` (raiz) continua sendo o resumo das regras e aponta para o cofre; o Claude Code mantém as notas atualizadas.

## Regras de manutenção
1. Módulo novo → nota a partir de `_Modelos/Modelo - Módulo` + linha no Dashboard.
2. Decisão que muda arquitetura, contrato ou dado → ADR a partir de `_Modelos/Modelo - ADR`.
3. Armadilha nova → tabela de lições em [[Arquitetura e Padrões]] §10 (e no esqueleto, para os próximos projetos).

## Consequências
- ✅ Documentação versionada, navegável e sempre perto do código.
- ⚠️ Links quebram se renomear arquivo fora do Obsidian — renomeie pelo Obsidian (`alwaysUpdateLinks` ligado).

Relacionados: [[00 - Dashboard]] · [[Arquitetura e Padrões]]
