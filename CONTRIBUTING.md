# Contribuindo

Obrigado pelo interesse! Antes de começar:

1. Leia as regras de arquitetura em [CLAUDE.md](CLAUDE.md) (módulo = projeto, sem referência entre módulos, SQL explícito com Dapper, erro de negócio = `Result`).
2. Abra uma issue descrevendo a ideia antes de um PR grande.
3. Trabalhe numa branch (`feat/...`, `fix/...`), commits pequenos com mensagem clara (`feat:`, `fix:`, `docs:`).
4. **Toda mudança de comportamento tem teste**: integração (API + PostgreSQL reais) no backend, Vitest e Playwright no app.
   Endpoint novo = resposta no `core/mock/mock-api.interceptor.ts` + teste E2E.
5. Rode antes de abrir o PR:
   ```bash
   dotnet test                                   # precisa de Docker (Testcontainers) ou AGENTDESK_TESTES_BANCO
   cd src/AgentDesk.Web && npm test && npm run test:scripts && npm run e2e
   ```
6. **Nenhum segredo no Git** (senha de banco, chaves da API, tokens). Use `appsettings.Development.example.json` como modelo.

## Licença das contribuições
O projeto é **AGPL-3.0** ([LICENSE](LICENSE)). Ao abrir um pull request você declara que o trabalho é seu (ou que pode enviá-lo) e concorda que ele seja
distribuído sob a AGPL-3.0 **e** que o mantenedor possa oferecê-lo também sob outra licença (por exemplo, comercial). Se isso não serve para você, abra uma issue antes.

Dúvidas de segurança: [SECURITY.md](SECURITY.md).
