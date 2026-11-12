---
tags: [adr]
---
# ADR-020 — Ver como (admin em somente leitura)

- **Status:** aceita
- **Data:** 2026-11-12

## Contexto
O ADMIN precisa enxergar o app como cada usuário vê (o que aparece, o que falta), sem pedir a senha de ninguém.

## Decisão
- `POST /api/v1/auth/ver-como { usuarioId }` (só `ADMIN`) devolve uma sessão do usuário escolhido, com o claim `ver_como` (id do admin) e
  **60 minutos** de vida. Vale **só para contas USUARIO** (nunca outro ADMIN).
- **Somente leitura no servidor:** o middleware `UseVerComoSomenteLeitura` recusa POST/PUT/PATCH/DELETE desse token com
  `403 Auth.SomenteLeitura`, antes dos controllers. Não depende do app esconder botões.
- Como o token é de USUARIO, as rotas de admin ficam fechadas, e não dá para encadear outro "Ver como".
- **Auditoria:** cada uso grava uma linha em `auditoria_ver_como` (admin, usuário, quando).
- **App:** o admin escolhe o usuário em Configurações ("Ver como um usuário"). A sessão do admin fica guardada (`agentdesk.sessao.admin`)
  e uma **faixa fixa no topo** diz "Você está vendo como X (somente leitura)" com o botão "Sair do modo", que volta sem pedir senha.
  Se a sessão do admin já venceu, volta para o login.

## Consequências
- O admin vê o que a pessoa vê, incluindo a máscara da chave da API (nunca a chave inteira, que nem a pessoa vê).
- Ler também deixa rastros normais de leitura (nada que grave dado de negócio); o registro de auditoria é o único efeito.
- Não há "agir como o usuário": se for preciso, vira outra decisão.
