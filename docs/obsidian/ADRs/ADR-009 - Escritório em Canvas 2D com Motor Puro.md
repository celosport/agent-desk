---
tags: [adr]
---
# ADR-009 — Escritório em Canvas 2D com motor puro

- **Status:** aceita
- **Data:** 2026-10-30

## Contexto
A tela "Escritório" mostra cada automação como um personagem numa sala em pixel art isométrica, que anda até a mesa, "pensa" e mostra
tokens e custo. Requisitos: arte **original** (nada de imagens, nomes ou marca de terceiros, como o Habbo), sem bibliotecas pesadas,
respeitando `prefers-reduced-motion`, testável e sem atrapalhar o resto do app.

## Decisão
- **Canvas 2D** desenhado por código (`features/escritorio/motor/desenho.ts`): piso, paredes, janela, quadro, mesas, monitor (acende
  quando o agente pensa), plantas e os **robôs-agentes** (sprites 10 × 14 em texto, em `personagens.ts`, cada pixel vira 2 × 2).
  Escala **inteira** conforme a largura (`escalaPara`) + `image-rendering: pixelated`: a pixel art fica nítida.
- **Motor puro** separado do desenho, testado no Vitest: `iso.ts` (projeção, rota em "L", andar) e `agente.ts` (máquina de estados
  OCIOSO → INDO → PENSANDO → RESULTADO → VOLTANDO, com o tempo vindo de fora). O resultado que chega antes de o agente sentar fica
  pendente; o "pensando…" dura no mínimo 0,7 s; o balão do resultado, 9 s.
- **Balões em HTML** sobre o canvas (texto nítido), posicionados pelo motor. A lista de agentes, o status de cada um e uma região
  `aria-live` ("Sumi: pensando…") tornam a cena acessível; o canvas tem `role="img"` com uma descrição curta.
- **Movimento reduzido:** o agente não anda (aparece na mesa e volta direto), não "respira", não pisca e a tela do monitor não pisca;
  os pontinhos do balão param (CSS).
- **Desempenho:** os agentes ficam num array comum que o desenho lê a cada quadro; só um signal `versao` muda quando a fase ou o
  balão muda (é o que o HTML escuta). `requestAnimationFrame` para quando a página sai; o navegador já pausa em segundo plano.
- O Escritório dispara as automações pela mesma API (`POST /automacoes/{id}/executar`), com o seu próprio `data-access`
  (feature não importa feature). Vários agentes podem trabalhar ao mesmo tempo; o mesmo agente, um pedido por vez.

## Alternativas consideradas
- SVG: mais simples para poucos elementos, mas pixel art com centenas de "pixels" e animação a cada quadro fica pesada no DOM.
- Bibliotecas de jogo (Phaser, PixiJS): centenas de KB para uma sala com três personagens.
- Imagens/sprites prontos: violariam o "arte original" e exigiriam um pipeline de assets.

## Consequências
- ✅ Zero dependência nova; o motor tem testes de unidade e o E2E confere a cena (canvas desenhado, fases, movimento reduzido).
- ✅ Personagem novo = uma entrada em `PERSONAGENS` (por `codigo` da automação); sem entrada, usa o robô padrão.
- ⚠️ Cabem 4 mesas (`MAXIMO_AGENTES`); mais automações exigem uma sala maior.
- ⚠️ Execuções disparadas em outra tela (Automações) não animam o Escritório — ele mostra só o que é pedido nele.

Relacionados: [[00 - Dashboard]] · [[Escritório Animado]] · [[Módulo Automacoes]] · [[Frontend (Angular PWA)]]
