// Testes do coletor (node --test). Garantem o principal: NADA de conteúdo sai do PC e o settings.json do usuário é preservado.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  EVENTOS,
  INTERVALO_LIMITES_MS,
  MARCA,
  argumentosDoClaude,
  comPastaLiberada,
  comandoCurto,
  pastaDaTarefa,
  pastaParaLiberar,
  pastasParaServidor,
  resultadoDaSaida,
  semPastaLiberada,
  tarefaValida,
  deveEnviarLimites,
  EVENTOS_CONTROLE,
  saidaDeParada,
  saidaDePermissao,
  limitesDaStatusline,
  mesclarSettings,
  projetoDe,
  removerDoSettings,
  repositorioDe,
  tituloDaSessao,
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

test('repositório: pasta com .git, subpasta e worktree dão o nome do projeto, não o da pasta de trabalho', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'adk-repo-'));
  try {
    const repo = join(raiz, 'zena');
    mkdirSync(join(repo, '.git', 'worktrees', 'ajuste-1'), { recursive: true });
    mkdirSync(join(repo, 'src', 'api'), { recursive: true });
    const worktree = join(raiz, 'scratch-2026-11-11-7479aa');
    mkdirSync(worktree);
    writeFileSync(join(worktree, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 'ajuste-1')}\n`);
    const solta = join(raiz, 'sem-git');
    mkdirSync(solta);

    assert.equal(repositorioDe(repo), 'zena');
    assert.equal(repositorioDe(join(repo, 'src', 'api')), 'zena');
    assert.equal(repositorioDe(worktree), 'zena');
    assert.equal(repositorioDe(join(raiz, 'nao-existe')), undefined);
    assert.equal(repositorioDe(''), undefined);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('título: o último custom-title do transcript vale mais que o ai-title; sem título, nada', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'adk-titulo-'));
  try {
    const linhas = (...itens) => itens.map((i) => JSON.stringify(i)).join('\n') + '\n';
    const so_ia = join(raiz, 'ia.jsonl');
    writeFileSync(so_ia, linhas({ type: 'user', message: 'oi' }, { type: 'ai-title', aiTitle: 'Lançamento de pagamento em dinheiro' }));
    const renomeada = join(raiz, 'renomeada.jsonl');
    writeFileSync(renomeada, linhas({ type: 'ai-title', aiTitle: 'Título da IA' }, { type: 'custom-title', customTitle: 'Funcionalidade de cortesia' },
      { type: 'custom-title', customTitle: '  Funcionalidade de cortesia e troca  ' }));
    const sem = join(raiz, 'sem.jsonl');
    writeFileSync(sem, linhas({ type: 'user', message: 'oi' }));

    assert.equal(tituloDaSessao(so_ia), 'Lançamento de pagamento em dinheiro');
    assert.equal(tituloDaSessao(renomeada), 'Funcionalidade de cortesia e troca');
    assert.equal(tituloDaSessao(sem), undefined);
    assert.equal(tituloDaSessao(join(raiz, 'nao-existe.jsonl')), undefined);
    assert.equal(tituloDaSessao(undefined), undefined);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('evento: o repositório vira o nome da sala (a chave continua a do caminho) e o título vai junto', () => {
  const hook = { session_id: 's9', hook_event_name: 'Stop', cwd: '/tmp/scratch-2026-11-11-7479aa' };
  const e = resumirEvento(hook, 'Notebook', new Date(), { repositorio: 'zena', titulo: 'Lançamento de pagamento em dinheiro' });
  assert.equal(e.projeto, 'zena');
  assert.equal(e.titulo, 'Lançamento de pagamento em dinheiro');
  assert.equal(e.projetoChave, projetoDe('/tmp/scratch-2026-11-11-7479aa').projetoChave);
  const sem = resumirEvento(hook, 'Notebook');
  assert.equal(sem.projeto, 'scratch-2026-11-11-7479aa');
  assert.equal('titulo' in sem, false);
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

test('dentro de um subagente o evento leva o id e o tipo dele (para virar um robô ajudante); fora, não', () => {
  const dentro = resumirEvento(
    { session_id: 's1', hook_event_name: 'PreToolUse', cwd: '/x/loja', tool_name: 'Grep', tool_input: { pattern: 'x' }, agent_id: 'ag-1', agent_type: 'Explore' },
    'N',
  );
  assert.equal(dentro.agenteId, 'ag-1');
  assert.equal(dentro.agenteTipo, 'Explore');
  const fora = resumirEvento({ session_id: 's1', hook_event_name: 'PreToolUse', cwd: '/x/loja', tool_name: 'Grep', agent_type: 'security-reviewer' }, 'N');
  assert.ok(!('agenteId' in fora) && !('agenteTipo' in fora)); // --agent na sessão inteira não é subagente
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

// ---- mandar tarefa pelo app (ADR-018) ----

test('tarefas: o servidor só recebe nome e chave da pasta — nunca o caminho', () => {
  const pasta = pastaParaLiberar('/home/ana/trabalho/loja');
  const config = comPastaLiberada({ url: 'x' }, pasta);

  assert.deepEqual(pastasParaServidor(config), [{ projetoChave: projetoDe(pasta.caminho).projetoChave, projeto: 'loja' }]);
  assert.ok(!JSON.stringify(pastasParaServidor(config)).includes('trabalho'));
  assert.equal(pastaDaTarefa(config, pasta.projetoChave).caminho, pasta.caminho);
  assert.equal(pastaDaTarefa(config, 'ffffffffffff'), undefined); // pasta que o usuário não liberou aqui
});

test('tarefas: liberar duas vezes não duplica, bloquear tira, e há um teto de 50 pastas', () => {
  const pasta = pastaParaLiberar('/home/ana/loja');
  let config = comPastaLiberada(comPastaLiberada({}, pasta), pasta);
  assert.equal(config.pastasLiberadas.length, 1);
  assert.deepEqual(semPastaLiberada(config, pasta).pastasLiberadas, []);

  config = {};
  for (let i = 0; i < 50; i++) config = comPastaLiberada(config, pastaParaLiberar(`/p/pasta${i}`));
  assert.throws(() => comPastaLiberada(config, pastaParaLiberar('/p/uma-a-mais')), /No máximo 50/);
});

test('tarefas: os argumentos do claude são fixos — o texto da tarefa nunca entra na linha de comando', () => {
  const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const args = argumentosDoClaude(id);

  assert.deepEqual(args, ['-p', '--session-id', id, '--permission-mode', 'default', '--max-turns', '100']);
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.throws(() => argumentosDoClaude('x"; rm -rf /'), /inválido/);
  assert.throws(() => argumentosDoClaude(undefined), /inválido/);
});

test('tarefas: tarefa mal formada é recusada', () => {
  const boa = { tarefaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', projetoChave: 'aaaaaaaaaaaa', texto: 'Rode os testes' };
  assert.equal(tarefaValida(boa), true);
  assert.equal(tarefaValida({ ...boa, tarefaId: 'nao-e-guid' }), false);
  assert.equal(tarefaValida({ ...boa, texto: '   ' }), false);
  assert.equal(tarefaValida({ ...boa, texto: 'x'.repeat(4001) }), false);
  assert.equal(tarefaValida(null), false);
});

test('tarefas: o resultado para o app é só o código de saída', () => {
  assert.deepEqual(resultadoDaSaida(0, null), { status: 'CONCLUIDA' });
  assert.deepEqual(resultadoDaSaida(1, null), { status: 'FALHOU', erro: 'O Claude Code saiu com o código 1.' });
  assert.deepEqual(resultadoDaSaida(null, 'SIGTERM'), { status: 'FALHOU', erro: 'O Claude Code foi interrompido (SIGTERM).' });
});

/** "claude" de mentira: grava como foi chamado (argumentos, stdin e pasta) e sai com o código de FAKE_EXIT. */
function claudeFalso(casa) {
  const script = join(casa, 'claude-falso.mjs');
  const destino = casa.replace(/\\/g, '/');
  writeFileSync(
    script,
    [
      "import { writeFileSync } from 'node:fs';",
      "let stdin = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (c) => (stdin += c));",
      "process.stdin.on('end', () => {",
      "  const id = process.argv[process.argv.indexOf('--session-id') + 1];",
      `  writeFileSync('${destino}/saida-' + id + '.json', JSON.stringify({ args: process.argv.slice(2), stdin, cwd: process.cwd() }));`,
      '  process.exit(Number(process.env.FAKE_EXIT || 0));',
      '});',
      '',
    ].join('\n'),
  );
  if (process.platform === 'win32') {
    const lanca = join(casa, 'claude.cmd');
    writeFileSync(lanca, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    return lanca;
  }
  const lanca = join(casa, 'claude.sh');
  writeFileSync(lanca, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(lanca, 0o755);
  return lanca;
}

/**
 * Sobe o coletor em modo "escutar" contra um AgentDesk de mentira. `montarTarefas(liberada)` devolve as tarefas que o servidor entrega na
 * 1ª busca (a pasta liberada de verdade é uma pasta temporária). Espera os resultados chegarem e derruba o coletor.
 */
async function escutarComTarefas(montarTarefas, { saida = 0, esperados = 1 } = {}) {
  const resultados = [];
  const pastasRecebidas = [];
  const buscas = [];
  let entregue = false;
  const casa = mkdtempSync(join(tmpdir(), 'adk-'));
  const pasta = mkdtempSync(join(tmpdir(), 'adk-proj-'));
  const liberada = pastaParaLiberar(realpathSync(pasta));
  const tarefas = montarTarefas(liberada);

  const servidor = createServer((req, res) => {
    let dados = '';
    req.on('data', (c) => (dados += c));
    req.on('end', () => {
      if (req.method === 'PUT' && req.url === '/api/v1/sessoes/controle/pastas') {
        pastasRecebidas.push(dados);
        res.writeHead(204).end();
      } else if (req.method === 'GET' && req.url.startsWith('/api/v1/sessoes/controle/tarefas')) {
        buscas.push(req.url);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(entregue ? [] : tarefas));
        entregue = true;
      } else if (req.method === 'POST' && /\/controle\/tarefas\/[^/]+\/resultado$/.test(req.url)) {
        resultados.push({ id: req.url.split('/')[6], corpo: JSON.parse(dados), token: req.headers['x-agentdesk-token'] });
        res.writeHead(204).end();
      } else res.writeHead(404).end();
    });
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  mkdirSync(join(casa, '.agentdesk'));
  writeFileSync(
    join(casa, '.agentdesk', 'config.json'),
    JSON.stringify({ url: `http://127.0.0.1:${servidor.address().port}`, token: 'adk_teste', maquina: 'Notebook', pastasLiberadas: [liberada] }),
  );
  const claude = claudeFalso(casa);
  const filho = spawn(process.execPath, [SCRIPT, 'escutar', '--claude', claude], {
    env: { ...process.env, HOME: casa, USERPROFILE: casa, AGENTDESK_INTERVALO_MS: '100', FAKE_EXIT: String(saida) },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 150 && resultados.length < esperados; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 400)); // mais algumas buscas: não pode chegar nem sair nada novo
    // Lê agora: o `finally` apaga a pasta temporária
    const saidas = Object.fromEntries(
      readdirSync(casa).filter((f) => /^saida-.*\.json$/.test(f)).map((f) => [f.slice(6, -5), JSON.parse(readFileSync(join(casa, f), 'utf8'))]),
    );
    const lerSaida = (id) => saidas[id] ?? null;
    return { resultados: [...resultados], pastasRecebidas, buscas, liberada, lerSaida };
  } finally {
    filho.kill();
    servidor.close();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(casa, { recursive: true, force: true });
    rmSync(pasta, { recursive: true, force: true });
  }
}

const ID_TAREFA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

test('escutar: abre o claude na pasta liberada com o texto no stdin (nunca na linha de comando) e informa que concluiu', async () => {
  const texto = 'Rode "npm test" && echo $(whoami); rm -rf / `x` — com acentuação';
  const r = await escutarComTarefas((liberada) => [{ tarefaId: ID_TAREFA, projetoChave: liberada.projetoChave, texto }]);

  assert.equal(r.resultados.length, 1);
  assert.equal(r.resultados[0].id, ID_TAREFA);
  assert.deepEqual(r.resultados[0].corpo, { maquina: 'Notebook', status: 'CONCLUIDA' }); // nada do que o claude fez volta
  assert.equal(r.resultados[0].token, 'adk_teste');

  const saida = r.lerSaida(ID_TAREFA);
  assert.ok(saida, 'o claude falso deveria ter sido chamado');
  assert.deepEqual(saida.args, argumentosDoClaude(ID_TAREFA));
  assert.ok(!saida.args.join(' ').includes('npm'), 'o texto não pode aparecer nos argumentos');
  assert.equal(saida.stdin, texto);
  assert.equal(saida.cwd.toLowerCase(), r.liberada.caminho.toLowerCase()); // a pasta (já resolvida) em que o claude foi aberto

  // Informou as pastas sem caminho e buscou só as tarefas deste computador
  assert.ok(r.pastasRecebidas.length >= 1);
  assert.ok(!r.pastasRecebidas[0].includes(r.liberada.caminho.replace(/\\/g, '\\\\')), 'o caminho não pode sair do PC');
  assert.match(r.pastasRecebidas[0], /"projeto"/);
  assert.match(r.buscas[0], /maquina=Notebook/);
});

test('escutar: código de saída diferente de zero vira FALHOU com o código, sem texto do claude', async () => {
  const r = await escutarComTarefas((liberada) => [{ tarefaId: ID_TAREFA, projetoChave: liberada.projetoChave, texto: 'faça algo' }], { saida: 3 });

  assert.deepEqual(r.resultados[0].corpo, { maquina: 'Notebook', status: 'FALHOU', erro: 'O Claude Code saiu com o código 3.' });
});

test('escutar: tarefa para uma pasta que o usuário NÃO liberou no PC é recusada sem abrir o claude', async () => {
  const r = await escutarComTarefas(() => [{ tarefaId: ID_TAREFA, projetoChave: 'ffffffffffff', texto: 'apague tudo' }]);

  assert.equal(r.resultados.length, 1);
  assert.equal(r.resultados[0].corpo.status, 'FALHOU');
  assert.match(r.resultados[0].corpo.erro, /Pasta não liberada neste computador/);
  assert.equal(r.lerSaida(ID_TAREFA), null, 'o claude não pode ter sido chamado');
});

test('escutar: tarefa com id que não é GUID (servidor adulterado) é recusada', async () => {
  const r = await escutarComTarefas((liberada) => [{ tarefaId: 'x"; calc.exe; "', projetoChave: liberada.projetoChave, texto: 'oi' }], { esperados: 1 });

  assert.equal(r.resultados.length, 1);
  assert.equal(r.resultados[0].corpo.status, 'FALHOU');
});

test('liberar e bloquear: guardam o caminho só no PC e "pastas" lista', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'adk-'));
  const pasta = mkdtempSync(join(tmpdir(), 'adk-proj-'));
  try {
    mkdirSync(join(casa, '.agentdesk'));
    writeFileSync(join(casa, '.agentdesk', 'config.json'), JSON.stringify({ url: 'http://127.0.0.1:9', token: 'adk_x', maquina: 'N' }));

    const liberou = await rodarComando(casa, ['liberar', pasta]);
    assert.equal(liberou.codigo, 0, liberou.saida);
    assert.match(liberou.saida, /liberada/);
    const config = JSON.parse(readFileSync(join(casa, '.agentdesk', 'config.json'), 'utf8'));
    assert.equal(config.pastasLiberadas.length, 1);
    assert.equal(config.token, 'adk_x'); // o resto da configuração fica como estava

    assert.match((await rodarComando(casa, ['pastas'])).saida, /→/);
    assert.equal((await rodarComando(casa, ['liberar', join(casa, 'nao-existe')])).codigo, 1);

    assert.equal((await rodarComando(casa, ['bloquear', pasta])).codigo, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(casa, '.agentdesk', 'config.json'), 'utf8')).pastasLiberadas, []);
  } finally {
    rmSync(casa, { recursive: true, force: true });
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('atualizar e instalar mantêm as pastas liberadas', async () => {
  await comServidor(() => ({ status: 200, json: {} }), async (casa) => {
    const pasta = pastaParaLiberar('/home/ana/loja');
    const configAntes = JSON.parse(readFileSync(join(casa, '.agentdesk', 'config.json'), 'utf8'));
    writeFileSync(join(casa, '.agentdesk', 'config.json'), JSON.stringify({ ...configAntes, pastasLiberadas: [pasta] }));

    const r = await rodarComando(casa, ['atualizar', '--sem-teste']);

    assert.equal(r.codigo, 0, r.saida);
    assert.deepEqual(JSON.parse(readFileSync(join(casa, '.agentdesk', 'config.json'), 'utf8')).pastasLiberadas, [pasta]);
  });
});
