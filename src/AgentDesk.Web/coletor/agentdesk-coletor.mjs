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
//   node agentdesk-coletor.mjs testar          (manda uma sessão de teste: o robô aparece no Escritório)
//   node agentdesk-coletor.mjs desinstalar     (tira os hooks e a telemetria do ~/.claude/settings.json)
//   node agentdesk-coletor.mjs evento          (uso interno: os hooks chamam com o JSON do evento no stdin)
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
export function mesclarSettings(atual, { comando, url, token, forcar = false }) {
  const settings = removerDoSettings(structuredClone(atual || {}), []).settings;
  settings.hooks = settings.hooks || {};
  for (const evento of EVENTOS) {
    // SessionEnd tem 1,5 s de prazo e hooks assíncronos podem não chegar com a sessão fechando: este vai síncrono e curto
    const handler = evento === 'SessionEnd' ? { type: 'command', command: comando, timeout: 3 } : { type: 'command', command: comando, async: true, timeout: 10 };
    settings.hooks[evento] = [...(settings.hooks[evento] || []), { hooks: [handler] }];
  }

  const avisos = [];
  const envDefinido = [];
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
  return { settings, envDefinido, avisos };
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

  const [maior] = process.versions.node.split('.').map(Number);
  if (maior < 18) {
    console.error(`O coletor precisa do Node 18 ou mais novo (este é o ${process.versions.node}).`);
    process.exit(1);
  }

  if (modo === 'instalar') {
    const o = argumentos(resto);
    const url = String(o.url || '').replace(/\/+$/, '');
    if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) throw new Error('Informe --url com https:// (ou http://localhost).');
    if (!String(o.token || '').startsWith('adk_')) throw new Error('Informe --token com o token gerado em Configurações → Claude Code (começa com adk_).');

    const script = fileURLToPath(import.meta.url).replace(/\\/g, '/');
    const comando = `node "${script}" evento`;
    const config = { url, token: String(o.token), maquina: String(o.maquina || 'Computador') };

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
    const { settings, envDefinido, avisos } = mesclarSettings(limpo, { comando, url, token: config.token, forcar: !!o.forcar });
    writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
    writeFileSync(CONFIG, `${JSON.stringify({ ...config, envDefinido }, null, 2)}\n`, { mode: 0o600 });
    console.log(`• Hooks do AgentDesk adicionados em ${SETTINGS}`);
    console.log(envDefinido.length ? '• Telemetria (tokens e custo) ligada, com prompts redigidos.' : '• Telemetria NÃO alterada.');
    avisos.forEach((a) => console.log(`⚠ ${a}`));
    await modoTestar(config);
    console.log('Pronto! As sessões NOVAS do Claude Code já aparecem (as que estavam abertas: reinicie-as).');
    return;
  }

  if (modo === 'testar') return modoTestar(lerJson(CONFIG, {}));

  if (modo === 'desinstalar') {
    const config = lerJson(CONFIG, {});
    const { settings, removidos } = removerDoSettings(lerJson(SETTINGS, {}), config.envDefinido || []);
    writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
    writeFileSync(CONFIG, `${JSON.stringify({ ...config, token: undefined, envDefinido: [] }, null, 2)}\n`);
    console.log(`✔ ${removidos} hooks e a telemetria do AgentDesk removidos. Revogue o token em Configurações → Claude Code.`);
    return;
  }

  console.log('Modos: instalar --url URL --token adk_... --maquina NOME [--forcar] · testar · desinstalar');
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
  const evento = !process.argv[2] || process.argv[2] === 'evento';
  principal()
    // O stdin pode ficar aberto: sai explicitamente, sempre com 0 no modo evento (nunca atrapalha o Claude Code)
    .then(() => evento && process.exit(0))
    .catch((e) => {
      if (evento) process.exit(0);
      console.error(`✖ ${e.message}`);
      process.exit(1);
    });
}
