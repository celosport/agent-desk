# Segurança

## Reportar uma vulnerabilidade
**Não abra uma issue pública.** Use o recurso "Report a vulnerability" (Security → Advisories) deste repositório no GitHub, ou escreva ao mantenedor
pelo e-mail do perfil. Explique o que encontrou, como reproduzir e o impacto. Respondemos em até 7 dias.

## O que o projeto protege
- **Chave da API da Anthropic**: cifrada no banco (Data Protection), nunca devolvida ao navegador (só os 4 últimos caracteres).
- **Isolamento**: tudo é filtrado pelo usuário do token; dado de outro usuário responde 404.
- **Coletor do Claude Code**: só metadados saem do computador (nome da pasta, ferramenta, tokens). Autentica com um token de ingestão (guardamos só o hash) revogável.
- **Controle remoto** (Parar/Aprovar/Negar): opcional (`--sem-controle`); sem resposta, o Claude Code pergunta no terminal — nunca aprova sozinho.

## Se for hospedar
- Gere **você** o `JWT_CHAVE_SECRETA` e a senha do banco (`.env.example`); nunca reutilize os valores de exemplo.
- Ponha HTTPS na frente (proxy reverso) antes de expor na internet.
- Segredos só em variável de ambiente ou *secret manager* — nunca no Git (`appsettings.Development.json` está no `.gitignore`).
