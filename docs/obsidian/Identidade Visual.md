# Identidade Visual

Marca do **Agent Desk**: futurista, "central de comando" de agentes de IA. Código no `src/AgentDesk.Web`; veja também [[Frontend (Angular PWA)]].

## Logo
- **Símbolo:** hexágono (a "sala/escritório") com um **A** dentro e um **nó branco no vértice** (o agente aceso), com três trilhas de circuito saindo — ideia de agentes conectados.
- **Nome:** `AGENT` (cor do texto) + `DESK` (degradê ciano → violeta), caixa-alta e espaçamento largo. O texto no HTML continua "Agent Desk"; o caixa-alta é só CSS.
- Arquivos em `public/icons/`: `marca.svg` (sem fundo, usada no app) · `icone.svg` (ícone com fundo, 512) · `maskable.svg` (PWA, com margem de segurança) · PNGs 192/512/maskable e `favicon.ico` gerados a partir deles.
- Componente: `shared/ui/logo.component.ts` (`<app-logo />`; tamanho por `--logo-tamanho`). Usado no topo (`shell`) e em login/cadastro.

## Cores
| Token | Valor | Uso |
|---|---|---|
| Fundo do ícone | `#070a14` → `#1b2250` | ícone, `theme_color` do manifest (`#0b1020`) |
| `--ui-neon-1` | `#22d3ee` (escuro) · `#0891b2` (claro) | ciano: realces, foco, linha do menu ativo |
| `--ui-neon-2` | `#8b6cff` (escuro) · `#6d4aff` (claro) | violeta: fim do degradê |
| `--ui-degrade` | ciano → violeta | linha sob o topo, palavra DESK |
| `--ui-marca` | `#3b5bdb` | botões primários (mantido) |
| `--ui-marca-tinta` (escuro) | `#7fd8ff` | links e texto de marca no tema escuro |
| `--ui-brilho` | glow ciano suave | só no tema escuro; `none` no claro |

Tema escuro virou azul-noite (`#0a0d1a` fundo, `#111629` superfície, `#28315a` linhas). Regra: neon é **enfeite/realce**, nunca a única forma de passar informação; texto segue os tokens de contraste.

## Como regenerar os PNGs
Edite os SVGs, renderize no Chrome em 192, 512 e (maskable) 512 e recorte no tamanho exato; o `favicon.ico` é um PNG 48×48 embutido num ICO.
