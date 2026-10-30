# syntax=docker/dockerfile:1
# AgentDesk — imagem única: API .NET 8 + app Angular (servido pela própria API em wwwroot).
# Usada no deploy do Railway — ver docs/obsidian/Deploy (Railway).md

# ---- 1. App Angular (PWA) ----
FROM node:24-bookworm-slim AS app
WORKDIR /web
COPY src/AgentDesk.Web/package.json src/AgentDesk.Web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src/AgentDesk.Web/ ./
RUN npx ng build --configuration production

# ---- 2. API .NET ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
COPY Directory.Build.props Directory.Packages.props ./
COPY src/BuildingBlocks/ src/BuildingBlocks/
COPY src/Modules/ src/Modules/
COPY src/Host/ src/Host/
RUN dotnet publish src/Host/AgentDesk.API/AgentDesk.API.csproj -c Release -o /app /p:UseAppHost=false

# ---- 3. Execução ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=api /app ./
COPY --from=app /web/dist/agentdesk-web/browser ./wwwroot
# Scripts do banco (aplicados ao subir quando Banco__AplicarScripts=true)
COPY database/*.sql ./database/
# O Railway termina o HTTPS e repassa X-Forwarded-For/Proto: o app precisa saber o IP real e o esquema original.
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true \
    DOTNET_RUNNING_IN_CONTAINER=true
EXPOSE 8080
# O Railway informa a porta em $PORT (8080 fora dele)
CMD ["sh", "-c", "ASPNETCORE_HTTP_PORTS=${PORT:-8080} exec dotnet AgentDesk.API.dll"]
