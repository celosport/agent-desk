/**
 * Desenvolvimento contra a API local. Subir a API (F5 no Visual Studio ou `dotnet run --project src/Host/AgentDesk.API`)
 * já sobe este app junto pelo SPA Proxy — [[ADR-003 - Frontend Junto da API (SPA Proxy)]].
 */
export const environment = {
  production: false,
  apiBaseUrl: 'https://localhost:52480',
  mockApi: false,
};
