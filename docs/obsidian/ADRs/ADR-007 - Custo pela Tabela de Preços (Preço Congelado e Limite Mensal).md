---
tags: [adr]
---
# ADR-007 — Custo pela tabela de preços (preço congelado e limite mensal)

- **Status:** aceita
- **Data:** 2026-10-30

## Contexto
O painel mostra gasto em US$, e a Anthropic muda preços e lança modelos. Nome de modelo e preço fixos no código obrigariam um deploy
a cada mudança, e recalcular o histórico com o preço novo falsearia o passado.

## Decisão
- Tabela `modelos_claude` (PK = id da API, ex.: `claude-opus-5-5`) com o preço por **milhão** de tokens: entrada, saída e, opcionalmente,
  leitura e escrita de cache. Só o **ADMIN** cria e edita. Modelo não é apagado, é **desativado** (o histórico continua apontando para ele).
- Carga inicial **uma vez só** (`migracoes_dados`, nome `2026-10-30-modelos-claude-iniciais`), com os preços de 2026-10: Fable 5.1, Opus 5.5,
  Sonnet 5.5 e Haiku 5.5. Depois disso, a verdade é o banco.
- Custo de uma chamada = `entrada × preço_entrada + saída × preço_saída + cache_leitura × preço_cache_leitura + cache_escrita × preço_cache_escrita`,
  dividido por 1.000.000. Cache sem preço cadastrado entra pelo preço de entrada.
- O log de consumo (Fase 2) grava os **preços usados** junto da chamada: mudar a tabela não altera o histórico.
- Limite mensal opcional por usuário (`configuracoes_usuario.limite_mensal_usd`): aviso a 80%; a 100%, bloqueia novas execuções se
  `bloquear_ao_atingir_limite` (padrão), ou só avisa. O mês é contado no fuso **America/Sao_Paulo**.

## Alternativas consideradas
- Preços em `appsettings`: ainda exigiria um deploy para mudar e não daria para editar pela tela.
- Calcular o custo na leitura (join com o preço atual): falseia o histórico quando o preço muda.

## Consequências
- ✅ Modelo novo ou preço novo = editar na tela, sem deploy.
- ⚠️ Preço por faixa (ex.: Haiku 5.5 acima de 100K tokens de entrada) não é modelado: a tabela usa o preço da faixa comum.
- ⚠️ O custo é **estimado** pela tabela; a fatura oficial é a do Console da Anthropic.

Relacionados: [[00 - Dashboard]] · [[Módulo Configuracoes]] · [[ADR-006 - Integração com a API da Anthropic]]
