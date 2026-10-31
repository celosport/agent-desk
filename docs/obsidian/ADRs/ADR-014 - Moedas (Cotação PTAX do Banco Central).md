---
tags: [adr]
---
# ADR-014 — Moedas (cotação PTAX do Banco Central)

- **Status:** aceita
- **Data:** 2026-10-31

## Contexto
Todos os custos do app são calculados em dólar (o preço da Anthropic é em dólar, [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]).
O usuário quer ver os valores também em R$, € e £.

## Decisão
- **Dado continua em dólar; a conversão é só na exibição.** Custos gravados, preços dos modelos e o limite mensal não mudam: nada é
  recalculado nem gravado em outra moeda.
- **Fonte:** PTAX de **venda** do Banco Central (API aberta Olinda, `CotacaoMoedaDia`, sem chave), do boletim de **fechamento** (ou do
  último do dia). Dólar, euro e libra vêm em reais; o servidor guarda em `cotacoes_moeda` (uma linha por moeda, com a data) e o
  endpoint `GET /api/v1/cotacoes` devolve **taxas por 1 US$**: BRL = PTAX do dólar; EUR = PTAX do dólar ÷ PTAX do euro; idem GBP.
- **Rotina** no servidor (`CotacoesRotina`): ao subir e a cada 6 h. Fim de semana e feriado não têm cotação: olha até 7 dias para trás.
  Falha só vai para o log (o app segue com a última cotação). Uma cotação mais antiga nunca substitui a mais nova.
  Desligada nos testes (`Configuracoes__CotacoesRotinaHabilitada=false`): nenhum teste chama o Banco Central.
- **App:** seletor de moeda no topo (US$, R$, €, £), guardado **neste navegador** (`localStorage`, como o tema). `formatarDolar` e
  `formatarDolarCompacto` convertem pela moeda ativa (signals: as telas se atualizam na hora); `formatarDolarFixo` nunca converte e é
  usado onde o valor é **definido** em dólar (tabela de preços dos modelos e limite mensal).
- **Sem cotação** (nunca buscou, BCB fora do ar): `503 Cotacoes.Indisponivel`, o seletor só oferece o dólar e tudo segue em US$.
  A moeda escolhida fica guardada para quando a cotação voltar. O tooltip do seletor mostra a fonte e a data da PTAX.

## Consequências
- O valor em R$ de um custo antigo muda com a cotação do dia (é conversão de exibição, não o que foi pago). A fatura da Anthropic é em dólar.
- A preferência não acompanha o usuário entre aparelhos (ficou por conveniência; guardar no servidor é um passo futuro simples).
- Dependência externa nova (Banco Central), mas só do servidor, só em segundo plano e com degradação para dólar.
