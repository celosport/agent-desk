// Testes do coletor (node --test). Garantem o principal: NADA de conteúdo sai do PC e o settings.json do usuário é preservado.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EVENTOS,
  INTERVALO_LIMITES_MS,
  MARCA,
  comandoCurto,
  deveEnviarLimites,
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
