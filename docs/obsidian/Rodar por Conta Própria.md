---
tags: [guia]
---
# Rodar por conta própria

Guia para quem baixa o AgentDesk e quer rodar na própria máquina ou servidor. Visão geral: [[00 - Dashboard]] · Hospedagem na nuvem do projeto: [[Deploy (Railway)]].

## 1. Subir
```bash
cp .env.example .env     # preencha POSTGRES_PASSWORD e JWT_CHAVE_SECRETA (openssl rand -base64 48)
docker compose -f docker-compose.selfhost.yml up -d --build
```
`http://localhost:8080` → criar conta → **Configurações** → cadastrar a sua chave da Anthropic (cifrada no seu banco). O `schema.sql` é aplicado ao subir (idempotente: pode reiniciar à vontade).

## 2. Virar administrador
O primeiro usuário é comum. Para editar prompts e a tabela de modelos/preços, promova a conta:
```bash
docker compose -f docker-compose.selfhost.yml exec postgres psql -U agentdesk -d agentdesk \
  -c "UPDATE usuarios SET tipo_perfil = 'ADMIN' WHERE lower(email) = lower('voce@exemplo.com');"
```

## 3. HTTPS e domínio
Ponha um proxy reverso na frente (Caddy é o mais simples: `reverse_proxy app:8080`). A API já entende `X-Forwarded-*`. O coletor do Claude Code exige `https://` (ou `http://localhost`).

## 4. Conectar o Claude Code (opcional)
Em **Configurações → Claude Code**, gere o token e rode o comando de instalação no PC (Node 18+). Só metadados saem do PC. `--sem-controle` desliga Parar/Aprovar/Negar. [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]] · [[ADR-015 - Parar e Aprovar-Negar Sessões do Claude Code]]

## 5. Atualizar
```bash
git pull && docker compose -f docker-compose.selfhost.yml up -d --build
```
Os dados ficam no volume `pgdata`. Rode o comando "Já conectei antes" de Configurações para atualizar o coletor.

## 6. Backup
```bash
docker compose -f docker-compose.selfhost.yml exec -T postgres pg_dump -U agentdesk agentdesk > backup-$(date +%F).sql
```
**Guarde também o JWT_CHAVE_SECRETA.** A chave da API de cada usuário é cifrada com chaves guardadas no próprio banco (tabela `chaves_protecao_dados`): perder o banco inteiro perde as chaves.

## 7. Moedas
O servidor busca a cotação (PTAX) no Banco Central ao subir e a cada 6 h; precisa de saída para a internet. Sem ela, tudo segue em dólar. [[ADR-014 - Moedas (Cotação PTAX do Banco Central)]]
