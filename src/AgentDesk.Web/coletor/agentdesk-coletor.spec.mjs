// Testes do coletor (node --test). Garantem o principal: NADA de conteúdo sai do PC e o settings.json do usuário é preservado.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  EVENTOS,
  INTERVALO_LIMITES_MS,
  MARCA,
  comandoCurto,
  deveEnviarLimites,
  EVENTOS_CONTROLE,
  saidaDeParada,
  saidaDePermissao,
  limitesDaStatusline,
  mesclarSettings,
  projetoDe,
  removerDoSettings,
  resumirEvento,
  resumoDaFerramenta,
  textoDaStatusline,
} from './agentdesk-coletor.mjs';

const comando = `node "/home/ana/.agentdesk/${MARCA}.mjs" evento`;

test('projeto: só o nome da pasta, e um hash do caminho para separar pastas homônimas', () => {
  const a = projetoDe('/home/ana/trabalho/api');
  const b = projetoDe('/home/ana/pessoal/api');
  assert.equal(a.projeto, 'api');
  assert.equal(a.projetoChave.length, 12);
  assert.notEqual(a.projetoChave, b.projetoChave);
  assert.equal(projetoDe('C:\\Projetos\\agent-desk\\').projeto, 'agent-desk');
});

test('arquivo: só o nome, sem caminho e sem conteúdo', () => {
  assert.equal(resumoDaFerramenta('Write', { file_path: '/home/ana/app/src/segredo.ts', content: 'const senha = "x"' }), 'segredo.ts');
  assert.equal(resumoDaFerramenta('Edit', { file_path: 'C:\\app\\api.ts', old_string: 'a', new_string: 'b' }), 'api.ts');
});

test('comando: só as duas primeiras palavras e nada com cara de segredo', () => {
  assert.equal(comandoCurto('npm test -- --watch=false'), 'npm test');
  assert.equal(comandoCurto('git commit -m "msg"'), 'git commit');
  assert.equal(comandoCurto('TOKEN=abc curl https://x'), 'curl');
  assert.equal(comandoCurto('export sk_live_0123456789abcdefghijklmn'), 'export');
  assert.equal(comandoCurto('curl -H "Authorization: Bearer xyz"'), 'curl');
  assert.equal(comandoCurto(''), undefined);
});

test('web e busca: só o domínio e um trecho curto do padrão', () => {
  assert.equal(resumoDaFerramenta('WebFetch', { url: 'https://docs.exemplo.com/a/b?token=1', prompt: 'leia' }), 'docs.exemplo.com');
  assert.equal(resumoDaFerramenta('Grep', { pattern: 'function SortMenu' }), '“function SortMenu”');
  assert.equal(resumoDaFerramenta('Read', {}), undefined);
});

test('evento enxuto: prompt, resposta e conteúdo do tool_input nunca vão para a API', () => {
  const hook = {
    session_id: 's1',
    hook_event_name: 'UserPromptSubmit',
    cwd: '/home/ana/loja',
    prompt: 'minha senha é 123',
    transcript_path: '/home/ana/.claude/projects/x.jsonl',
  };
  const evento = resumirEvento(hook, 'Notebook', new Date('2026-10-30T12:00:00Z'));
  assert.deepEqual(evento, {
    sessaoId: 's1',
    evento: 'UserPromptSubmit',
    maquina: 'Notebook',
    projeto: 'loja',
    projetoChave: projetoDe('/home/ana/loja').projetoChave,
    ocorridoEm: '2026-10-30T12:00:00.000Z',
  });
  assert.ok(!JSON.stringify(evento).includes('senha'));

  const ferramenta = resumirEvento(
    { session_id: 's1', hook_event_name: 'PreToolUse', cwd: '/x/loja', tool_name: 'Bash', tool_input: { command: 'npm run build && rm -rf /' } },
    'Notebook',
  );
  assert.equal(ferramenta.ferramenta, 'Bash');
  assert.equal(ferramenta.resumo, 'npm run');

  const aviso = resumirEvento({ session_id: 's1', hook_event_name: 'Notification', cwd: '/x', notification_type: 'permission_prompt', message: 'Claude precisa...' }, 'N');
  assert.equal(aviso.notificacao, 'permission_prompt');
  assert.ok(!('message' in aviso));
});

test('eventos fora da lista ou sem sessão são ignorados', () => {
  assert.equal(resumirEvento({ session_id: 's', hook_event_name: 'FileChanged', cwd: '/x' }, 'N'), null);
  assert.equal(resumirEvento({ hook_event_name: 'Stop', cwd: '/x' }, 'N'), null);
});

test('instalar preserva hooks e variáveis do usuário e é idempotente', () => {
  const doUsuario = {
    model: 'opus',
    env: { MINHA_VAR: '1' },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'meu-lint.sh' }] }] },
  };
  const uma = mesclarSettings(doUsuario, { comando, url: 'https://app.exemplo.com/', token: 'adk_abc' });
  const duas = mesclarSettings(uma.settings, { comando, url: 'https://app.exemplo.com', token: 'adk_abc' });

  assert.deepEqual(duas.settings, uma.settings); // rodar de novo não duplica
  assert.equal(uma.settings.model, 'opus');
  assert.equal(uma.settings.env.MINHA_VAR, '1');
  assert.equal(uma.settings.hooks.PreToolUse.length, 2);
  assert.equal(uma.settings.hooks.PreToolUse[0].hooks[0].command, 'meu-lint.sh');
  for (const evento of EVENTOS) assert.ok(uma.settings.hooks[evento].some((g) => g.hooks[0].command === comando));
  assert.equal(uma.settings.hooks.PreToolUse[1].hooks[0].async, true); // não atrasa a sessão
  assert.equal(uma.settings.hooks.SessionEnd[0].hooks[0].async, undefined); // o fim da sessão vai síncrono e curto
  assert.equal(uma.settings.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, 'https://app.exemplo.com/api/v1/sessoes/otlp/v1/logs');
  assert.equal(uma.settings.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS, 'X-AgentDesk-Token=adk_abc');
  assert.equal(uma.settings.env.OTEL_LOG_USER_PROMPTS, undefined); // prompts continuam redigidos (padrão)
});

test('não troca a telemetria de outra ferramenta sem --forcar', () => {
  const comOutra = { env: { OTEL_LOGS_EXPORTER: 'console', OTEL_EXPORTER_OTLP_ENDPOINT: 'https://minha-observabilidade' } };
  const r = mesclarSettings(comOutra, { comando, url: 'https://app', token: 'adk_x' });
  assert.equal(r.envDefinido.length, 0);
  assert.equal(r.settings.env.OTEL_LOGS_EXPORTER, 'console');
  assert.equal(r.avisos.length, 1);
  assert.equal(mesclarSettings(comOutra, { comando, url: 'https://app', token: 'adk_x', forcar: true }).settings.env.OTEL_LOGS_EXPORTER, 'otlp');
});

test('desinstalar tira só o que o coletor pôs', () => {
  const doUsuario = { env: { MINHA_VAR: '1' }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'avisar.sh' }] }] } };
  const instalado = mesclarSettings(doUsuario, { comando, url: 'https://app', token: 'adk_x' });
  const { settings, removidos } = removerDoSettings(instalado.settings, instalado.envDefinido);
  assert.deepEqual(settings, doUsuario);
  assert.equal(removidos, EVENTOS.length);
});

const comandoStatusline = `node "/home/ana/.agentdesk/${MARCA}.mjs" statusline`;

test('statusline: lê as janelas de 5 h e da semana (percentual 0 a 100 e renovação em segundos Unix)', () => {
  const limites = limitesDaStatusline({
    session_id: 's1',
    rate_limits: { five_hour: { used_percentage: 23.46, resets_at: 1738425600 }, seven_day: { used_percentage: 41.2, resets_at: 1738857600 } },
  });
  assert.deepEqual(limites, {
    cincoHoras: { percentual: 23.5, renovaEm: '2025-02-01T16:00:00.000Z' },
    semana: { percentual: 41.2, renovaEm: '2025-02-06T16:00:00.000Z' },
  });
});

test('statusline: plano sem janelas, janela só de um lado ou dado estranho não quebram', () => {
  assert.deepEqual(limitesDaStatusline({}), {});
  assert.deepEqual(limitesDaStatusline(null), {});
  assert.deepEqual(limitesDaStatusline({ rate_limits: {} }), {});
  assert.deepEqual(limitesDaStatusline({ rate_limits: { five_hour: { used_percentage: 'x', resets_at: 1738425600 } } }), {});
  assert.deepEqual(limitesDaStatusline({ rate_limits: { five_hour: { used_percentage: 10 } } }), {}); // sem renovação
  const so = limitesDaStatusline({ rate_limits: { seven_day: { used_percentage: 150, resets_at: 1738857600 } } });
  assert.equal(so.cincoHoras, undefined);
  assert.equal(so.semana.percentual, 100); // limitado a 100
  assert.equal(limitesDaStatusline({ rate_limits: { five_hour: { used_percentage: -5, resets_at: 1738425600 } } }).cincoHoras.percentual, 0);
});

test('statusline: o texto da barra', () => {
  assert.equal(textoDaStatusline({ cincoHoras: { percentual: 34.4 }, semana: { percentual: 38 } }), 'AgentDesk · 5h 34% · semana 38%');
  assert.equal(textoDaStatusline({ semana: { percentual: 38 } }), 'AgentDesk · semana 38%');
  assert.equal(textoDaStatusline({}), 'AgentDesk');
});

test('statusline: envia no máximo 1 vez por minuto', () => {
  assert.equal(deveEnviarLimites(undefined, 1_000), true);
  assert.equal(deveEnviarLimites(1_000, 1_000 + INTERVALO_LIMITES_MS - 1), false);
  assert.equal(deveEnviarLimites(1_000, 1_000 + INTERVALO_LIMITES_MS), true);
});

test('instalar liga a statusline, é idempotente e desinstalar tira só a nossa', () => {
  const opcoes = { comando, url: 'https://app', token: 'adk_x', comandoStatusline };
  const uma = mesclarSettings({ model: 'opus' }, opcoes);
  const duas = mesclarSettings(uma.settings, opcoes);

  assert.equal(uma.statuslineDefinida, true);
  assert.deepEqual(uma.settings.statusLine, { type: 'command', command: comandoStatusline });
  assert.deepEqual(duas.settings, uma.settings);
  const { settings } = removerDoSettings(uma.settings, uma.envDefinido);
  assert.deepEqual(settings, { model: 'opus' });
});

test('statusline do usuário é mantida, a não ser com --statusline; desinstalar não mexe nela', () => {
  const minha = { type: 'command', command: '~/.claude/minha-statusline.sh' };
  const opcoes = { comando, url: 'https://app', token: 'adk_x', comandoStatusline };

  const mantida = mesclarSettings({ statusLine: minha }, opcoes);
  assert.deepEqual(mantida.settings.statusLine, minha);
  assert.equal(mantida.statuslineDefinida, false);
  assert.ok(mantida.avisos.some((a) => a.includes('statusline')));
  assert.deepEqual(removerDoSettings(mantida.settings, mantida.envDefinido).settings.statusLine, minha);

  const trocada = mesclarSettings({ statusLine: minha }, { ...opcoes, forcarStatusline: true });
  assert.equal(trocada.settings.statusLine.command, comandoStatusline);
});

const comandoControle = `node "/home/ana/.agentdesk/${MARCA}.mjs" controle`;

test('controle: saída que PARA o Claude Code e saída de aprovar/negar', () => {
  const parar = saidaDeParada();
  assert.equal(parar.continue, false);
  assert.equal(parar.stopReason, 'Parado pelo AgentDesk');
  assert.equal(parar.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(parar.hookSpecificOutput.permissionDecision, 'deny'); // a ferramenta daquela vez também não roda

  assert.deepEqual(saidaDePermissao('APROVAR'), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  assert.equal(saidaDePermissao('NEGAR').hookSpecificOutput.decision.behavior, 'deny');
  // Sem decisão (ou qualquer valor estranho): sem saída, o Claude Code pergunta no terminal — nunca aprova sozinho
  for (const d of [null, undefined, '', 'TALVEZ', 'aprovar']) assert.equal(saidaDePermissao(d), null);
});

test('controle: hooks síncronos de PreToolUse e PermissionRequest, idempotentes e removíveis', () => {
  const opcoes = { comando, url: 'https://app', token: 'adk_x', comandoControle };
  const uma = mesclarSettings({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'meu-lint.sh' }] }] } }, opcoes);
  const duas = mesclarSettings(uma.settings, opcoes);

  assert.deepEqual(duas.settings, uma.settings);
  for (const evento of EVENTOS_CONTROLE) {
    const sincronos = uma.settings.hooks[evento].flatMap((g) => g.hooks).filter((h) => h.command === comandoControle);
    assert.equal(sincronos.length, 1);
    assert.equal(sincronos[0].async, undefined); // precisa responder antes de o Claude Code seguir
  }
  assert.equal(uma.settings.hooks.PreToolUse.flatMap((g) => g.hooks).find((h) => h.command === comandoControle).timeout, 5);
  assert.equal(uma.settings.hooks.PermissionRequest[0].hooks[0].timeout, 60);
  assert.ok(uma.settings.hooks.PreToolUse.some((g) => g.hooks[0].command === 'meu-lint.sh')); // o hook do usuário continua

  const { settings } = removerDoSettings(uma.settings, uma.envDefinido);
  assert.equal(settings.hooks.PermissionRequest, undefined);
  assert.deepEqual(settings.hooks.PreToolUse, [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'meu-lint.sh' }] }]);
});

test('sem comando de controle (--sem-controle) só observa: nenhum hook de PermissionRequest', () => {
  const r = mesclarSettings({}, { comando, url: 'https://app', token: 'adk_x' });
  assert.equal(r.settings.hooks.PermissionRequest, undefined);
  assert.ok(r.settings.hooks.PreToolUse.every((g) => g.hooks.every((h) => h.async === true))); // só o evento assíncrono de observação
});

// ---- o modo "controle" de ponta a ponta, contra um servidor falso ----

const SCRIPT = fileURLToPath(new URL('./agentdesk-coletor.mjs', import.meta.url));

/** Roda o hook como o Claude Code roda: JSON no stdin, saída no stdout. */
function rodarHook(casa, hook) {
  return new Promise((resolver) => {
    const filho = spawn(process.execPath, [SCRIPT, 'controle'], { env: { ...process.env, HOME: casa, USERPROFILE: casa } });
    let saida = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.on('close', (codigo) => resolver({ codigo, saida: saida.trim() }));
    filho.stdin.end(JSON.stringify(hook));
  });
}

async function comServidor(respostas, corpo) {
  const pedidos = [];
  const servidor = createServer((req, res) => {
    let dados = '';
    req.on('data', (c) => (dados += c));
    req.on('end', () => {
      pedidos.push({ metodo: req.method, url: req.url, token: req.headers['x-agentdesk-token'], corpo: dados });
      const r = respostas(req) ?? { status: 404, json: {} };
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const casa = mkdtempSync(join(tmpdir(), 'adk-'));
  mkdirSync(join(casa, '.agentdesk'));
  writeFileSync(join(casa, '.agentdesk', 'config.json'), JSON.stringify({ url: `http://127.0.0.1:${servidor.address().port}`, token: 'adk_teste', maquina: 'N' }));
  try {
    return await corpo(casa, pedidos);
  } finally {
    servidor.close();
    rmSync(casa, { recursive: true, force: true });
  }
}

test('controle (hook): app pediu para parar → o hook interrompe o Claude Code', async () => {
  await comServidor((req) => (req.url.startsWith('/api/v1/sessoes/controle/parada') ? { status: 200, json: { parar: true } } : null), async (casa, pedidos) => {
    const r = await rodarHook(casa, { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'rm -rf x' } });
    assert.equal(r.codigo, 0);
    assert.equal(JSON.parse(r.saida).continue, false);
    assert.equal(pedidos[0].token, 'adk_teste');
    assert.match(pedidos[0].url, /sessaoId=s1/);
    assert.ok(!pedidos[0].corpo.includes('rm')); // nada do comando sai do PC
  });
});

test('controle (hook): sem pedido de parada, servidor fora do ar ou erro → sem saída e código 0 (o Claude Code segue)', async () => {
  await comServidor(() => ({ status: 200, json: { parar: false } }), async (casa) => {
    const r = await rodarHook(casa, { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Read' });
    assert.deepEqual(r, { codigo: 0, saida: '' });
  });
  await comServidor(() => ({ status: 500, json: {} }), async (casa) => {
    assert.deepEqual(await rodarHook(casa, { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Read' }), { codigo: 0, saida: '' });
  });
  const semConfig = mkdtempSync(join(tmpdir(), 'adk-'));
  try {
    assert.deepEqual(await rodarHook(semConfig, { hook_event_name: 'PreToolUse', session_id: 's1' }), { codigo: 0, saida: '' });
  } finally {
    rmSync(semConfig, { recursive: true, force: true });
  }
});

test('controle (hook): permissão aprovada ou negada no app vira a decisão do Claude Code; só ferramenta e resumo seguro saem', async () => {
  for (const [decisao, esperado] of [['APROVAR', 'allow'], ['NEGAR', 'deny']]) {
    await comServidor((req) => {
      if (req.method === 'POST') return { status: 201, json: { permissaoId: '11111111-1111-1111-1111-111111111111' } };
      return { status: 200, json: { decisao } };
    }, async (casa, pedidos) => {
      const r = await rodarHook(casa, {
        hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm test -- --token=segredo123' },
      });
      assert.equal(JSON.parse(r.saida).hookSpecificOutput.decision.behavior, esperado);
      const enviado = JSON.parse(pedidos[0].corpo);
      assert.equal(enviado.ferramenta, 'Bash');
      assert.equal(enviado.resumo, 'npm test');
      assert.ok(!pedidos[0].corpo.includes('segredo123'));
      assert.match(pedidos[1].url, /controle\/permissoes\/11111111-1111-1111-1111-111111111111\?espera=45/);
    });
  }
});

test('controle (hook): ninguém decidiu no app → sem saída (o Claude Code pergunta no terminal)', async () => {
  await comServidor((req) => (req.method === 'POST' ? { status: 201, json: { permissaoId: '22222222-2222-2222-2222-222222222222' } } : { status: 200, json: {} }), async (casa) => {
    assert.deepEqual(await rodarHook(casa, { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Edit' }), { codigo: 0, saida: '' });
  });
});

function rodarComando(casa, args, env = {}) {
  return new Promise((resolver) => {
    const filho = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, HOME: casa, USERPROFILE: casa, ...env } });
    let saida = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (saida += d));
    filho.on('close', (codigo) => resolver({ codigo, saida }));
  });
}

test('nuvem: instalar pelas variáveis de ambiente (sem token na linha de comando) e sem mandar sessão de teste', async () => {
  await comServidor(() => ({ status: 200, json: {} }), async (casa, pedidos) => {
    rmSync(join(casa, '.agentdesk'), { recursive: true, force: true }); // ambiente de nuvem novo: nada instalado
    const r = await rodarComando(casa, ['instalar', '--sem-teste'], {
      AGENTDESK_URL: 'http://127.0.0.1:9', AGENTDESK_TOKEN: 'adk_da_nuvem', AGENTDESK_MAQUINA: 'PulseFit (nuvem)',
    });
    assert.equal(r.codigo, 0, r.saida);
    assert.match(r.saida, /Hooks do AgentDesk adicionados/);
    assert.doesNotMatch(r.saida, /adk_da_nuvem/); // o token não é impresso

    const config = JSON.parse(readFileSync(join(casa, '.agentdesk', 'config.json'), 'utf8'));
    assert.deepEqual([config.url, config.token, config.maquina], ['http://127.0.0.1:9', 'adk_da_nuvem', 'PulseFit (nuvem)']);
    const settings = JSON.parse(readFileSync(join(casa, '.claude', 'settings.json'), 'utf8'));
    for (const evento of EVENTOS) assert.ok(settings.hooks[evento], evento);
    assert.equal(settings.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS, 'X-AgentDesk-Token=adk_da_nuvem');
    assert.equal(pedidos.length, 0); // --sem-teste: nenhuma sessão de teste foi enviada
  });
});

test('nuvem: sem URL ou token (nem nas variáveis) o instalar explica o que falta e não mexe em nada', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'adk-'));
  try {
    const r = await rodarComando(casa, ['instalar', '--sem-teste'], { AGENTDESK_URL: '', AGENTDESK_TOKEN: '' });
    assert.notEqual(r.codigo, 0);
    assert.match(r.saida, /--url/);
    assert.equal(existsSync(join(casa, '.claude', 'settings.json')), false);
  } finally {
    rmSync(casa, { recursive: true, force: true });
  }
});

