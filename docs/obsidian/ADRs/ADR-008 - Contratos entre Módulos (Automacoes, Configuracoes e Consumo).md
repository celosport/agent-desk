---
tags: [adr]
---
# ADR-008 — Contratos entre módulos (Automacoes, Configuracoes e Consumo)

- **Status:** aceita
- **Data:** 2026-10-30

## Contexto
Rodar uma automação cruza três módulos: a chave, o modelo padrão, o limite e o preço são do **Configuracoes**; o fluxo é do
**Automacoes**; o log de consumo é do **Consumo**. A regra do monólito é: módulo nunca referencia outro módulo
([[ADR-001 - Monolito Modular]]).

## Decisão
- Contratos em `AgentDesk.SharedKernel/Contratos`, implementados pelo **dono** do dado e registrados no `IModule` dele:
  - `IConfiguracoesDeUso` (Configuracoes → `Application/Contratos/ConfiguracoesDeUso.cs`): `ObterPreferenciasAsync` (chave **já decifrada**,
    modelo padrão, limite, bloquear) e `ObterModeloAsync` (vira `PrecoModelo`, com `CustoDe(UsoTokens)`).
  - `IRegistroConsumo` (Consumo → `Infrastructure/Repositories/RegistroConsumoRepository.cs`): `RegistrarAsync(ChamadaClaude)` e
    `GastoNoPeriodoAsync` (para o limite mensal).
  - `IDiretorioUsuarios` (Contas → `Infrastructure/DiretorioUsuarios.cs`, Fase 3): só o **nome** dos usuários, para o consumo de
    "Todos" do ADMIN — o Consumo não lê a tabela `usuarios`.
- Tipos de troca também no SharedKernel: `UsoTokens`, `PrecoModelo`, `PreferenciasDeUso`, `ChamadaClaude`, `StatusChamada`.
- O cálculo do custo mora em `PrecoModelo.CustoDe` (uma fonte só; 6 casas). O Automacoes calcula e o Consumo grava o custo e os
  preços usados (congelados — [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]).
- "Mês" e "dia" contam no fuso de America/Sao_Paulo (`SharedKernel/Tempo/FusoBrasil.cs`), com o "agora" vindo do `TimeProvider`.
- Depois que o pedido sai para a Anthropic, a chamada e o registro usam `CancellationToken.None`: se o navegador desistir, a cobrança
  já aconteceu e o consumo precisa ser gravado.

## Alternativas consideradas
- Automacoes ler as tabelas `configuracoes_usuario`/`modelos_claude` direto: acoplaria o SQL de um módulo às tabelas de outro.
- Eventos de domínio/fila para o log: mais peças sem ganho real num monólito com um só banco.

## Consequências
- ✅ Os módulos continuam independentes; os testes de integração exercitam os três juntos pela API.
- ✅ A chave decifrada só existe na memória, durante a execução.
- ⚠️ A conferência do limite e a gravação não são atômicas: duas execuções ao mesmo tempo podem passar um pouco do limite.
  Aceitável para custo estimado; se precisar ser exato, travar por usuário (advisory lock).

Relacionados: [[00 - Dashboard]] · [[Módulo Automacoes]] · [[Módulo Consumo]] · [[Módulo Configuracoes]]
