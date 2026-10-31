#!/usr/bin/env node
// AgentDesk — coletor das sessões do Claude Code. Roda no SEU computador, chamado pelos hooks do Claude Code.
// [[ADR-010 - Sessões do Claude Code (Hooks e Telemetria)]]
//
// O que sai daqui: só METADADOS — nome da pasta do projeto, nome da ferramenta, nome do arquivo (sem o caminho), as duas
// primeiras palavras de um comando, o tipo de aviso. NUNCA o conteúdo de arquivos, o texto dos seus prompts ou respostas.
// Tokens e custo chegam pela telemetria oficial do Claude Code (OpenTelemetry), com prompts redigidos por padrão.
//
// Uso:
//   node agentdesk-coletor.mjs instalar --url https://seu-app --token adk_... --maquina "Notebook"
//   Claude Code na nuvem (ambiente remoto): defina AGENTDESK_URL, AGENTDESK_TOKEN e AGENTDESK_MAQUINA no ambiente e, no script de
//   preparação:  node agentdesk-coletor.mjs instalar --sem-teste   (Configurações → Claude Code → "Nuvem" gera o script pronto)
//   node agentdesk-coletor.mjs atualizar       (após baixar uma versão nova: reaplica tudo com a conexão já salva, sem outro token)
//   node agentdesk-coletor.mjs testar          (manda uma sessão de teste: o robô aparece no Escritório)
//   node agentdesk-coletor.mjs desinstalar     (tira os hooks, a telemetria e a statusline do ~/.claude/settings.json)
//   node agentdesk-coletor.mjs evento          (uso interno: os hooks chamam com o JSON do evento no stdin)
//   node agentdesk-coletor.mjs statusline      (uso interno: a statusline do Claude Code chama; mostra 5h/semana e avisa o AgentDesk)
//   node agentdesk-coletor.mjs controle        (uso interno: hooks SÍNCRONOS de PreToolUse e PermissionRequest: Parar e Aprovar/Negar)
//
// Controle (Parar e Aprovar/Negar pelo app): antes de cada ferramenta o coletor pergunta ao AgentDesk se você pediu para parar a
// sessão (1 consulta curta, 2,5 s no máximo) e, quando o Claude Code pede permissão, espera até 45 s a sua resposta no app. Sem
// resposta, erro ou rede fora: NADA muda e o Claude Code pergunta no terminal como sempre — nunca se aprova sozinho.
// Não quer isso? Instale com --sem-controle (só observa, sem hooks síncronos).
//
// Statusline: só o percentual das janelas de 5 h e da semana (e quando renovam) sai do PC, no máximo 1 vez por minuto, e só
// para quem tem plano Pro/Max (o Claude Code só informa isso a eles). Se você já tiver uma statusline própria, ela é mantida
// (use --statusline para trocar). [[ADR-013 - Janelas de Uso da Assinatura (Statusline)]]
//
// Sem dependências: Node 18+ (usa fetch). Sempre termina com código 0 no modo "evento" — nunca atrapalha o Claude Code.

import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARCA = 'agentdesk-coletor';
export const EVENTOS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'SessionEnd',
];

const PASTA = join(homedir(), '.agentdesk');
const CONFIG = join(PASTA, 'config.json');
const LOG = join(PASTA, 'coletor.log');
const SETTINGS = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json');
export const EVENTOS_CONTROLE = ['PreToolUse', 'PermissionRequest'];
/** Quanto o hook de permissão espera pela decisão do app (o servidor vence o pedido em ~55 s; o hook tem 60 s). */
export const ESPERA_PERMISSAO_S = 45;
const ESTADO_STATUSLINE = join(PASTA, 'statusline-estado.json');

/** Intervalo mínimo entre dois envios das janelas ao AgentDesk. */
export const INTERVALO_LIMITES_MS = 60_000;

// ---------------------------------------------------------------------------------------------------------------------
// Regras puras (testadas em agentdesk-coletor.spec.mjs)
// ---------------------------------------------------------------------------------------------------------------------

/** Nome da pasta (o que aparece na sala) + hash do caminho completo (separa duas pastas "api" diferentes). */
export function projetoDe(cwd) {
  const caminho = String(cwd || '').replace(/[\\/]+$/, '');
  const normalizado = process.platform === 'win32' ? caminho.toLowerCase().replace(/\\/g, '/') : caminho;
  return {
    projeto: corte(basename(caminho.replace(/\\/g, '/')) || '(raiz)', 120),
    projetoChave: createHash('sha256').update(normalizado).digest('hex').slice(0, 12),
  };
}

/** Resumo SEGURO da ferramenta: nunca conteúdo, nunca o comando inteiro (pode ter senha), nunca o caminho completo. */
export function resumoDaFerramenta(ferramenta, entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  switch (ferramenta) {
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit': {
      const caminho = e.file_path || e.notebook_path;
      return caminho ? corte(basename(String(caminho).replace(/\\/g, '/')), 80) : undefined;
    }
    case 'Bash':
    case 'PowerShell':
      return comandoCurto(e.command);
    case 'Grep':
    case 'Glob':
      return e.pattern ? `“${corte(String(e.pattern), 40)}”` : undefined;
    case 'WebFetch':
      try {
        return new URL(String(e.url)).hostname;
      } catch {
        return undefined;
      }
    case 'Task':
    case 'Agent':
      return e.subagent_type ? corte(String(e.subagent_type), 40) : undefined;
    default:
      return undefined;
  }
}

/** "npm test", "git commit" — só as duas primeiras palavras; algo com cara de segredo some. */
export function comandoCurto(comando) {
  if (!comando) return undefined;
  const palavras = String(comando).split('\n')[0].trim().split(/\s+/).slice(0, 2);
  const seguras = palavras.filter((p) => !/[=:@]/.test(p) && !/^[A-Za-z0-9_\-+/]{24,}$/.test(p) && !/^-/.test(p));
  return seguras.length ? corte(seguras.join(' '), 40) : undefined;
}

/** JSON do hook → evento enxuto para a API (ou null se não for de interesse). */
export function resumirEvento(hook, maquina, agora = new Date()) {
  if (!hook || typeof hook !== 'object' || !hook.session_id || !EVENTOS.includes(hook.hook_event_name)) return null;
  const { projeto, projetoChave } = projetoDe(hook.cwd);
  const evento = {
    sessaoId: corte(String(hook.session_id), 100),
    evento: hook.hook_event_name,
    maquina: corte(String(maquina || 'Computador'), 80),
    projeto,
    projetoChave,
    ocorridoEm: agora.toISOString(),
  };
  if (hook.tool_name) {
    evento.ferramenta = corte(String(hook.tool_name), 80);
    const resumo = resumoDaFerramenta(hook.tool_name, hook.tool_input);
    if (resumo) evento.resumo = resumo;
  }
  if (hook.hook_event_name === 'SubagentStart' && hook.agent_type) evento.resumo = corte(String(hook.agent_type), 40);
  if (hook.notification_type) evento.notificacao = corte(String(hook.notification_type), 40);
  if (typeof hook.model === 'string') evento.modelo = corte(hook.model, 80);
  else if (hook.model && typeof hook.model.id === 'string') evento.modelo = corte(hook.model.id, 80);
  return evento;
}

/** Percentual de 0 a 100 com 1 casa; qualquer coisa que não seja número vira undefined. */
function percentualValido(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 10) / 10)) : undefined;
}

/**
 * Lê `rate_limits` do JSON que o Claude Code manda à statusline (Pro/Max, depois da 1ª resposta da sessão):
 * `five_hour` e `seven_day` com `used_percentage` (0 a 100) e `resets_at` (segundos Unix). Janela ausente ou estranha é ignorada.
 */
export function limitesDaStatusline(entrada) {
  const limites = entrada && typeof entrada === 'object' ? entrada.rate_limits : null;
  const resultado = {};
  if (!limites || typeof limites !== 'object') return resultado;
  for (const [origem, destino] of [['five_hour', 'cincoHoras'], ['seven_day', 'semana']]) {
    const janela = limites[origem];
    const percentual = percentualValido(janela?.used_percentage);
    const renovaSegundos = Number(janela?.resets_at);
    if (percentual === undefined || !Number.isFinite(renovaSegundos) || renovaSegundos <= 0) continue;
    resultado[destino] = { percentual, renovaEm: new Date(renovaSegundos * 1000).toISOString() };
  }
  return resultado;
}

/** O texto da barra do Claude Code: "AgentDesk · 5h 34% · semana 38%" (só a marca, se o plano não informa as janelas). */
export function textoDaStatusline(limites) {
  const partes = ['AgentDesk'];
  if (limites?.cincoHoras) partes.push(`5h ${Math.round(limites.cincoHoras.percentual)}%`);
  if (limites?.semana) partes.push(`semana ${Math.round(limites.semana.percentual)}%`);
  return partes.join(' · ');
}

/** Envia no máximo 1 vez por minuto (a statusline roda a cada atualização da tela). */
export function deveEnviarLimites(ultimoEnvioMs, agoraMs) {
  return !Number.isFinite(ultimoEnvioMs) || agoraMs - ultimoEnvioMs >= INTERVALO_LIMITES_MS;
}

/** Saída do hook de ferramenta quando o app pediu para parar: bloqueia a ferramenta e interrompe o turno do Claude Code. */
export function saidaDeParada(motivo = 'Parado pelo AgentDesk') {
  return {
    continue: false,
    stopReason: motivo,
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo },
  };
}

/** Saída do hook PermissionRequest para a decisão do app; qualquer outra coisa = null (sem saída: o Claude Code pergunta no terminal). */
export function saidaDePermissao(decisao) {
  if (decisao === 'APROVAR') return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
  if (decisao === 'NEGAR') {
    return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Negado pelo AgentDesk' } } };
  }
  return null;
}

/** Variáveis da telemetria (só logs, em JSON, com o token no header; prompts continuam redigidos — o padrão). */
export function variaveisTelemetria(url, token) {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `${url.replace(/\/+$/, '')}/api/v1/sessoes/otlp/v1/logs`,
    OTEL_EXPORTER_OTLP_LOGS_HEADERS: `X-AgentDesk-Token=${token}`,
    OTEL_LOGS_EXPORT_INTERVAL: '5000',
    OTEL_METRICS_EXPORTER: 'none',
  };
}

/**
 * Junta os hooks e a telemetria do AgentDesk no settings.json SEM apagar o que já existe. Idempotente: tira as entradas
 * antigas do coletor antes de pôr as novas. Se já houver uma telemetria de outra ferramenta, não mexe (a não ser com forcar).
 * Devolve { settings, envDefinido, avisos }.
 */
export function mesclarSettings(atual, { comando, url, token, forcar = false, comandoStatusline, forcarStatusline = false, comandoControle }) {
  const settings = removerDoSettings(structuredClone(atual || {}), []).settings;
  settings.hooks = settings.hooks || {};
  for (const evento of EVENTOS) {
    // SessionEnd tem 1,5 s de prazo e hooks assíncronos podem não chegar com a sessão fechando: este vai síncrono e curto
    const handler = evento === 'SessionEnd' ? { type: 'command', command: comando, timeout: 3 } : { type: 'command', command: comando, async: true, timeout: 10 };
    settings.hooks[evento] = [...(settings.hooks[evento] || []), { hooks: [handler] }];
  }

  // Controle: hooks SÍNCRONOS (sem async) que consultam o app; só entram se o comando de controle foi informado
  if (comandoControle) {
    settings.hooks.PreToolUse = [...(settings.hooks.PreToolUse || []), { hooks: [{ type: 'command', command: comandoControle, timeout: 5 }] }];
    settings.hooks.PermissionRequest = [
      ...(settings.hooks.PermissionRequest || []),
      { hooks: [{ type: 'command', command: comandoControle, timeout: 60 }] },
    ];
  }

  const avisos = [];
  const envDefinido = [];
  let statuslineDefinida = false;
  if (comandoStatusline) {
    // Uma statusline que não é nossa fica como está, a não ser que peçam (--statusline): é do usuário
    if (settings.statusLine && !forcarStatusline) {
      avisos.push('Você já tem uma statusline: mantive a sua. As barras de 5 h e da semana não aparecem no AgentDesk (use --statusline para trocar).');
    } else {
      settings.statusLine = { type: 'command', command: comandoStatusline };
      statuslineDefinida = true;
    }
  }
  const desejado = variaveisTelemetria(url, token);
  settings.env = settings.env || {};
  const outraTelemetria =
    settings.env.OTEL_EXPORTER_OTLP_ENDPOINT || (settings.env.OTEL_LOGS_EXPORTER && settings.env.OTEL_LOGS_EXPORTER !== 'otlp');
  if (outraTelemetria && !forcar) {
    avisos.push('Já existe uma telemetria (OpenTelemetry) configurada: mantive a sua. Tokens e custo não vão aparecer no AgentDesk (use --forcar para trocar).');
  } else {
    for (const [chave, valor] of Object.entries(desejado)) {
      if (chave === 'OTEL_METRICS_EXPORTER' && settings.env[chave] && !forcar) continue; // não desliga métricas de outra ferramenta
      settings.env[chave] = valor;
      envDefinido.push(chave);
    }
  }
  return { settings, envDefinido, avisos, statuslineDefinida };
}

/** Tira do settings.json tudo o que o coletor pôs (hooks com a marca e as variáveis que ele definiu). */
export function removerDoSettings(atual, envDefinido) {
  const settings = structuredClone(atual || {});
  let removidos = 0;
  for (const [evento, grupos] of Object.entries(settings.hooks || {})) {
    const restantes = (grupos || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || '').includes(MARCA)) }))
      .filter((g) => g.hooks.length);
    removidos += (grupos || []).length - restantes.length;
    if (restantes.length) settings.hooks[evento] = restantes;
    else delete settings.hooks[evento];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (String(settings.statusLine?.command || '').includes(MARCA)) {
    delete settings.statusLine;
    removidos += 1;
  }
  for (const chave of envDefinido || []) if (settings.env) delete settings.env[chave];
  if (settings.env && !Object.keys(settings.env).length) delete settings.env;
  return { settings, removidos };
}

function corte(texto, max) {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------------------------------------------------

function lerJson(caminho, padrao) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return padrao;
  }
}

function registrar(mensagem) {
  try {
    mkdirSync(PASTA, { recursive: true });
    if (existsSync(LOG) && statSync(LOG).size > 200_000) writeFileSync(LOG, '');
    appendFileSync(LOG, `${new Date().toISOString()} ${mensagem}\n`);
  } catch {
    /* sem log não tem problema */
  }
}

async function enviar(config, evento, prazoMs) {
  const resposta = await fetch(`${config.url}/api/v1/sessoes/eventos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AgentDesk-Token': config.token },
    body: JSON.stringify(evento),
    signal: AbortSignal.timeout(prazoMs),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ${await resposta.text().catch(() => '')}`.slice(0, 300));
}

async function lerStdin(prazoMs) {
  return new Promise((resolver) => {
    let dados = '';
    const fim = setTimeout(() => resolver(dados), prazoMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (dados += c));
    process.stdin.on('end', () => {
      clearTimeout(fim);
      resolver(dados);
    });
  });
}

async function enviarLimites(config, limites, prazoMs) {
  const resposta = await fetch(`${config.url}/api/v1/sessoes/limites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AgentDesk-Token': config.token },
    body: JSON.stringify(limites),
    signal: AbortSignal.timeout(prazoMs),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
}

/** Chamado pela statusline do Claude Code: imprime a barra e, no máximo 1 vez por minuto, avisa o AgentDesk. Nunca falha. */
async function modoStatusline() {
  let limites = {};
  try {
    limites = limitesDaStatusline(JSON.parse((await lerStdin(1500)) || '{}'));
  } catch {
    /* sem JSON válido: só a marca */
  }
  console.log(textoDaStatusline(limites));
  try {
    const config = lerJson(CONFIG, null);
    if (!config?.url || !config?.token || (!limites.cincoHoras && !limites.semana)) return;
    const agora = Date.now();
    if (!deveEnviarLimites(lerJson(ESTADO_STATUSLINE, {}).ultimoEnvioMs, agora)) return;
    // Marca antes de enviar: se a rede falhar, tenta de novo só no próximo minuto (sem martelar o servidor)
    mkdirSync(PASTA, { recursive: true });
    writeFileSync(ESTADO_STATUSLINE, JSON.stringify({ ultimoEnvioMs: agora }));
    await enviarLimites(config, limites, 3000);
  } catch (e) {
    registrar(`statusline: ${e?.message ?? e}`);
  }
}

async function consultar(config, caminho, opcoes, prazoMs) {
  const resposta = await fetch(`${config.url}/api/v1/sessoes/${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', 'X-AgentDesk-Token': config.token },
    signal: AbortSignal.timeout(prazoMs),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

/**
 * Hook SÍNCRONO. PreToolUse: o app pediu para parar? PermissionRequest: espera a decisão do app. Só o necessário sai do PC (nome da
 * ferramenta e o mesmo resumo seguro dos outros hooks). Qualquer falha = sem saída = Claude Code segue o fluxo normal.
 */
async function modoControle() {
  try {
    const config = lerJson(CONFIG, null);
    if (!config?.url || !config?.token) return;
    const hook = JSON.parse((await lerStdin(2000)) || '{}');
    if (!hook?.session_id) return;
    const sessaoId = corte(String(hook.session_id), 100);

    if (hook.hook_event_name === 'PreToolUse') {
      const r = await consultar(config, `controle/parada?sessaoId=${encodeURIComponent(sessaoId)}`, { method: 'GET' }, 2500);
      if (r?.parar) console.log(JSON.stringify(saidaDeParada()));
      return;
    }

    if (hook.hook_event_name === 'PermissionRequest') {
      const corpo = { sessaoId, ferramenta: corte(String(hook.tool_name || 'ferramenta'), 80) };
      const resumo = resumoDaFerramenta(hook.tool_name, hook.tool_input);
      if (resumo) corpo.resumo = resumo;
      const criada = await consultar(config, 'controle/permissoes', { method: 'POST', body: JSON.stringify(corpo) }, 3000);
      const r = await consultar(config, `controle/permissoes/${criada.permissaoId}?espera=${ESPERA_PERMISSAO_S}`, { method: 'GET' },
        (ESPERA_PERMISSAO_S + 8) * 1000);
      const saida = saidaDePermissao(r?.decisao);
      if (saida) console.log(JSON.stringify(saida));
    }
  } catch (e) {
    registrar(`controle: ${e?.message ?? e}`);
  }
}

async function modoEvento() {
  try {
    const config = lerJson(CONFIG, null);
    if (!config?.url || !config?.token) return;
    const hook = JSON.parse((await lerStdin(2000)) || '{}');
    const evento = resumirEvento(hook, config.maquina);
    if (!evento) return;
    await enviar(config, evento, evento.evento === 'SessionEnd' ? 1200 : 4000);
  } catch (e) {
    registrar(`evento: ${e?.message ?? e}`);
  }
}

function argumentos(lista) {
  const opcoes = {};
  for (let i = 0; i < lista.length; i++) {
    if (!lista[i].startsWith('--')) continue;
    const chave = lista[i].slice(2);
    opcoes[chave] = lista[i + 1] && !lista[i + 1].startsWith('--') ? lista[++i] : true;
  }
  return opcoes;
}

async function modoTestar(config) {
  const sessao = `teste-instalacao-${Date.now()}`;
  const base = { session_id: sessao, cwd: join(homedir(), 'agentdesk-teste') };
  const passos = [
    { ...base, hook_event_name: 'SessionStart' },
    { ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'LEIA-ME.md' } },
    { ...base, hook_event_name: 'Stop' },
  ];
  for (const passo of passos) {
    await enviar(config, resumirEvento(passo, config.maquina), 8000);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('✔ Conexão ok: abra o Escritório → Claude Code. A sala "agentdesk-teste" mostra o robô de teste.');
}

async function principal() {
  const [modo, ...resto] = process.argv.slice(2);
  if (modo === 'evento' || !modo) return modoEvento();
  if (modo === 'statusline') return modoStatusline();
  if (modo === 'controle') return modoControle();

  const [maior] = process.versions.node.split('.').map(Number);
  if (maior < 18) {
    console.error(`O coletor precisa do Node 18 ou mais novo (este é o ${process.versions.node}).`);
    process.exit(1);
  }

  if (modo === 'instalar' || modo === 'atualizar') {
    const o = argumentos(resto);
    // "atualizar" reaproveita a conexão já salva (url, token e nome da máquina): não precisa de outro token
    const salva = modo === 'atualizar' ? lerJson(CONFIG, {}) : {};
    if (modo === 'atualizar' && (!salva.url || !salva.token)) throw new Error('Nada instalado ainda: rode "instalar" com --url e --token.');
    // Ambiente de nuvem (Claude Code remoto): a conexão vem de variáveis de ambiente, sem o token na linha de comando
    const env = process.env;
    const url = String(o.url || salva.url || env.AGENTDESK_URL || '').replace(/\/+$/, '');
    const tokenInformado = String(o.token || salva.token || env.AGENTDESK_TOKEN || '');
    if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) throw new Error('Informe --url com https:// (ou http://localhost).');
    if (!tokenInformado.startsWith('adk_')) throw new Error('Informe --token com o token gerado em Configurações → Claude Code (começa com adk_).');

    const script = fileURLToPath(import.meta.url).replace(/\\/g, '/');
    const comando = `node "${script}" evento`;
    const comandoStatusline = `node "${script}" statusline`;
    const comandoControle = `node "${script}" controle`;
    // Controle remoto ligado por padrão; --sem-controle (ou a escolha salva) deixa só a observação
    const semControle = o['sem-controle'] === true || (salva.semControle === true && o['com-controle'] !== true);
    const config = { url, token: tokenInformado, maquina: String(o.maquina || salva.maquina || env.AGENTDESK_MAQUINA || 'Computador') };

    mkdirSync(PASTA, { recursive: true });
    mkdirSync(dirname(SETTINGS), { recursive: true });
    const anterior = lerJson(CONFIG, {});
    const atual = lerJson(SETTINGS, {});
    if (existsSync(SETTINGS)) {
      const copia = `${SETTINGS}.agentdesk-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
      copyFileSync(SETTINGS, copia);
      console.log(`• Cópia de segurança: ${copia}`);
    }
    const limpo = removerDoSettings(atual, anterior.envDefinido || []).settings;
    const { settings, envDefinido, avisos, statuslineDefinida } = mesclarSettings(limpo, {
      comando, url, token: config.token, forcar: !!o.forcar, comandoStatusline, forcarStatusline: !!o.statusline,
      comandoControle: semControle ? undefined : comandoControle,
    });
    writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
    writeFileSync(CONFIG, `${JSON.stringify({ ...config, envDefinido, semControle }, null, 2)}\n`, { mode: 0o600 });
    console.log(`• Hooks do AgentDesk adicionados em ${SETTINGS}`);
    console.log(envDefinido.length ? '• Telemetria (tokens e custo) ligada, com prompts redigidos.' : '• Telemetria NÃO alterada.');
    console.log(semControle ? '• Controle remoto DESLIGADO (--sem-controle): só observa.' : '• Controle remoto ligado: Parar e Aprovar/Negar pelo app (sem resposta, o Claude Code pergunta no terminal).');
    if (statuslineDefinida) console.log('• Statusline ligada: a barra do Claude Code mostra "AgentDesk · 5h … · semana …" (planos Pro/Max).');
    avisos.forEach((a) => console.log(`⚠ ${a}`));
    // --sem-teste: ambientes que sobem e descem toda hora não precisam do robô de teste
    if (o['sem-teste'] !== true) await modoTestar(config);
    console.log('Pronto! As sessões NOVAS do Claude Code já aparecem (as que estavam abertas: reinicie-as).');
    return;
  }

  if (modo === 'testar') return modoTestar(lerJson(CONFIG, {}));

  if (modo === 'desinstalar') {
    const config = lerJson(CONFIG, {});
    const { settings, removidos } = removerDoSettings(lerJson(SETTINGS, {}), config.envDefinido || []);
    writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
    writeFileSync(CONFIG, `${JSON.stringify({ ...config, token: undefined, envDefinido: [] }, null, 2)}\n`);
    console.log(`✔ ${removidos} hooks e a telemetria (e a statusline, se era nossa) do AgentDesk removidos. Revogue o token em Configurações → Claude Code.`);
    return;
  }

  console.log('Modos: instalar --url URL --token adk_... --maquina NOME [--forcar] [--statusline] [--sem-controle] [--sem-teste] (ou as variáveis AGENTDESK_URL, AGENTDESK_TOKEN e AGENTDESK_MAQUINA) · atualizar [--com-controle] · testar · desinstalar');
}

/** Só executa quando chamado direto (o teste importa as funções sem rodar nada). No Windows, maiúsculas e barras variam. */
function chamadoDireto() {
  try {
    const a = realpathSync(process.argv[1]);
    const b = realpathSync(fileURLToPath(import.meta.url));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

if (chamadoDireto()) {
  const evento = !process.argv[2] || process.argv[2] === 'evento' || process.argv[2] === 'statusline' || process.argv[2] === 'controle';
  principal()
    // O stdin pode ficar aberto: sai explicitamente, sempre com 0 no modo evento (nunca atrapalha o Claude Code)
    .then(() => evento && process.exit(0))
    .catch((e) => {
      if (evento) process.exit(0);
      console.error(`✖ ${e.message}`);
      process.exit(1);
    });
}
