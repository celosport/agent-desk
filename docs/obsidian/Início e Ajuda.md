---
tags: [feature, frontend]
status: pronto
---
# 🏠 Início e Ajuda

Só app (nenhum endpoint novo): o **Início** é o painel do dia e a **Ajuda** (`/ajuda`) é o guia de uso dentro do app. Voltar: [[00 - Dashboard]]

| Parte | Onde |
|---|---|
| Início | `features/inicio` (`inicio.page.ts`, `mini-grafico.component.ts`, `data-access/inicio.{api,store,util,models}.ts`) |
| Ajuda | `features/ajuda/ajuda.page.ts` (texto estático; índice com `routerLink="." fragment`) |
| Guia para a IA | `shared/util/guia-ia.ts` (`baixarGuiaParaIa`) · arquivo `coletor/CONECTAR-COM-IA.md` servido em `/coletor/` |
| Testes | `inicio.util.spec.ts` · `inicio.store.spec.ts` · `guia-ia.spec.ts` · `e2e/inicio-ajuda.spec.ts` |

## Início (painel do dia)
- Consulta, por polling de 10 s (`core/tempo-real`), as APIs que já existem: `consumo/resumo`, `sessoes/painel`, `sessoes/dicas`, `sessoes/limites`, `sessoes/ao-vivo` e `configuracoes`. Cada fonte falha sozinha; o aviso só aparece se **nada** carregou.
- Blocos: Primeiros passos (some quando chave, Claude Code e uma automação estão feitos) · 4 números (automações hoje/mês, Claude Code hoje/mês) · limite do mês · "Agora no Claude Code" (quem espera por você em destaque) · dois gráficos de 14 dias · quem mais gasta · barras da assinatura · até 3 dicas.
- **Automações (API) e Claude Code ficam separados de propósito**: o primeiro é dinheiro real; o segundo é o equivalente na API (`≈`). Nunca somar os dois.
- ADMIN alterna "Meus números" × "Todos os usuários" (resumo, painel e dicas; o ao vivo, os limites e a configuração são sempre os próprios).
- Feature não importa feature: o Início tem o seu próprio recorte dos DTOs e a sua `InicioApi`.

## Consumo
- Abre na aba **Claude Code (assinatura)** quando o usuário não tem chamadas de automação mas tem pedidos do Claude Code (escolha só na primeira carga; depois vale o clique).
- Uma linha explica a aba atual, com link para a Ajuda (`/ajuda#gastos`).

## Armadilhas
- Âncora na página: usar `routerLink="." fragment="x"`, nunca `href="#x"` (com `<base href="/">` o `href` leva para a raiz). `anchorScrolling: 'enabled'` está no `app.config.ts`.
