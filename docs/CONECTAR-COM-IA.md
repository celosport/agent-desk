# Conectar o meu Claude Code ao AgentDesk (guia para a IA executar)

> **Como usar (pessoa):** baixe este arquivo, abra o Claude Code no seu computador e escreva:
> *"Leia o arquivo CONECTAR-COM-IA.md e conecte o meu Claude Code ao AgentDesk."*
> A IA vai seguir os passos abaixo e pedir o que faltar.

---

## Para a IA: instruções

Você vai instalar o **coletor** do AgentDesk no computador desta pessoa, para que as sessões do Claude Code dela apareçam no AgentDesk (Escritório, consumo de tokens, alertas). Siga na ordem. Não pule a confirmação do passo 2.

### O que é o AgentDesk (contexto curto)
Painel que mostra o que cada sessão do Claude Code está fazendo e quanto consome. Um programa pequeno (o coletor, `agentdesk-coletor.mjs`) roda no computador, filtra os eventos do Claude Code e envia **só metadados** ao servidor do AgentDesk: nome da pasta, ferramenta usada, nome do arquivo (sem caminho), contagem de tokens e custo. **Nunca** envia código-fonte, texto de prompts nem respostas.

### Passo 1 — Verifique os requisitos
Rode e confira:
```
node --version
```
- Precisa ser **Node 18 ou mais novo**. Se não houver Node ou for mais antigo, **pare** e peça para a pessoa instalar o Node LTS (https://nodejs.org) e depois recomeçar.
- Descubra o sistema (Windows PowerShell ou macOS/Linux) para escolher os comandos certos.

### Passo 2 — Peça os dados à pessoa (não invente)
Você precisa de **três informações**. Pergunte e espere:

1. **Endereço do AgentDesk** da equipe (ex.: `https://agentdesk.suaempresa.com`). Deve começar com `https://` (ou `http://localhost`).
2. **Token de conexão**, que começa com `adk_`. Quem gera é a pessoa, no AgentDesk: **Configurações → Claude Code → "Gerar token e comando"**. O token é mostrado **uma única vez**.
3. **Nome do computador** (ex.: `notebook-joao`), só para identificar na tela.

Regras:
- **Nunca invente nem reutilize** token ou endereço. Se a pessoa não tiver, explique onde gerar (item 2) e pare.
- Trate o token como segredo: **não** grave em arquivo do projeto, **não** faça commit, **não** repita em respostas além do necessário. Ele só vai no comando de instalação (ou na variável de ambiente `AGENTDESK_TOKEN` do processo).
- Se a pessoa colar o comando completo gerado pelo AgentDesk, pode usá-lo, mas leia-o antes: ele só deve baixar `/coletor/agentdesk-coletor.mjs` do endereço informado e rodar `instalar`.

### Passo 3 — Avise o que será alterado e confirme
Diga à pessoa, em poucas linhas, que a instalação vai:
- criar a pasta `~/.agentdesk/` com o coletor e a configuração de conexão;
- editar `~/.claude/settings.json` (**com backup automático antes**), **acrescentando** hooks e telemetria, sem apagar o que já existe;
- ligar o controle Parar / Aprovar-Negar pelo app (pode ser desligado com `--sem-controle`);
- enviar uma sessão de teste chamada "agentdesk-teste".

Peça um **"sim"** claro antes de executar. Pergunte também se quer o controle Parar/Aprovar-Negar (padrão: sim).

### Passo 4 — Instale
Substitua `URL`, `TOKEN` e `NOME` pelos valores informados.

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force "$HOME\.agentdesk" | Out-Null
Invoke-WebRequest "URL/coletor/agentdesk-coletor.mjs" -OutFile "$HOME\.agentdesk\agentdesk-coletor.mjs"
node "$HOME\.agentdesk\agentdesk-coletor.mjs" instalar --url "URL" --token "TOKEN" --maquina "NOME"
```

**macOS / Linux:**
```bash
mkdir -p ~/.agentdesk && curl -fsSL "URL/coletor/agentdesk-coletor.mjs" -o ~/.agentdesk/agentdesk-coletor.mjs
node ~/.agentdesk/agentdesk-coletor.mjs instalar --url "URL" --token "TOKEN" --maquina "NOME"
```

Opções do `instalar` (use só se fizer sentido):
| Opção | Efeito |
|---|---|
| `--sem-controle` | Só observa; desliga Parar e Aprovar/Negar pelo app. |
| `--sem-teste` | Não envia a sessão de teste. |
| `--statusline` | Troca a statusline atual pela do AgentDesk (barras de 5 h e da semana). Sem isso, uma statusline existente é mantida. |
| `--forcar` | Troca uma telemetria (OpenTelemetry) que já exista. Sem isso, a existente é mantida. |

Leia a saída do comando e relate à pessoa os **avisos** (ex.: "você já tem uma statusline: mantive a sua").

### Passo 5 — Verifique
1. Rode:
   ```
   node ~/.agentdesk/agentdesk-coletor.mjs testar
   ```
   (no Windows: `node "$HOME\.agentdesk\agentdesk-coletor.mjs" testar`). Ele manda uma sessão de teste ao servidor; se não der erro, a conexão funciona.
2. Confira que `~/.claude/settings.json` contém hooks apontando para `agentdesk-coletor.mjs` e que existe um backup do arquivo.
3. Diga à pessoa para: **abrir uma sessão nova** do Claude Code (as sessões já abertas não pegam os hooks novos) e olhar **Escritório → Claude Code (ao vivo)** no AgentDesk. A sala "agentdesk-teste" deve ter aparecido.

Se falhar, veja a tabela de erros abaixo; não tente contornar mudando o servidor ou o token por conta própria.

### Erros comuns
| Mensagem / sintoma | Causa e solução |
|---|---|
| `Informe --url com https://` | Endereço sem `https://`. Só `http://localhost` é aceito sem HTTPS. |
| `Informe --token ... (começa com adk_)` | Token errado. Gere outro em Configurações → Claude Code. |
| 401 / token inválido | Token revogado ou digitado errado. Gerar um novo. |
| Falha ao baixar o coletor | Endereço errado ou sem rede até o servidor. Confirmar no navegador que o AgentDesk abre. |
| Aviso de statusline/telemetria existente | Foi mantida a configuração da pessoa. Só use `--statusline` / `--forcar` se ela pedir. |
| Sessão não aparece | Abrir sessão **nova**; rodar `testar`; conferir internet/VPN até o servidor. |
| Sem barras de 5 h e semana | Exigem plano Pro/Max e a primeira resposta da sessão; sem statusline do AgentDesk não aparecem. |

### Passo 6 — Entregue um resumo
Informe: o que foi instalado e onde, se houve avisos, como **atualizar**, como **remover** e que o token deve ser revogado no app se ela trocar de computador.

---

## Comandos úteis depois de instalado

(No Windows PowerShell, troque `~` por `$HOME` e `/` por `\`.)

```bash
# atualizar o coletor mantendo o mesmo token
node ~/.agentdesk/agentdesk-coletor.mjs atualizar

# mandar uma sessão de teste (o robô aparece no Escritório)
node ~/.agentdesk/agentdesk-coletor.mjs testar

# remover tudo que foi instalado (depois, revogue o token no app)
node ~/.agentdesk/agentdesk-coletor.mjs desinstalar
```

### Mandar tarefa do app para este computador (opcional)
Só se a pessoa quiser disparar tarefas pelo AgentDesk. **Quem libera a pasta é a pessoa, aqui no computador**; nunca libere uma pasta sem ela pedir.

```bash
cd /caminho/do/projeto
node ~/.agentdesk/agentdesk-coletor.mjs liberar     # libera esta pasta
node ~/.agentdesk/agentdesk-coletor.mjs pastas      # lista as liberadas
node ~/.agentdesk/agentdesk-coletor.mjs bloquear    # remove esta pasta
node ~/.agentdesk/agentdesk-coletor.mjs escutar     # deixar aberto para receber tarefas
```
Se o `claude` não estiver no PATH: `escutar --claude CAMINHO`. Avise que o texto da tarefa fica guardado no servidor (não colocar senhas) e que o computador precisa estar ligado com o `escutar` aberto.

### Claude Code na nuvem
Um ambiente de nuvem é outra máquina. Em **Configurações → Claude Code → Nuvem**, o AgentDesk gera as variáveis de ambiente (`AGENTDESK_URL`, `AGENTDESK_TOKEN`, `AGENTDESK_MAQUINA`) e o script de preparação. Não grave o token no repositório.

## O que este guia NÃO faz
- Não mede chamadas que o código do projeto faz diretamente na API da Claude: só as sessões do Claude Code e as automações executadas dentro do AgentDesk. Para essas chamadas, use o limite de gastos do Console da Anthropic, com uma chave por projeto.
- Não precisa alterar nenhum arquivo do projeto da pessoa: a conexão fica na configuração do usuário (`~/.claude` e `~/.agentdesk`).

Guia completo para o usuário final: `docs/apresentacao/index.html`.
