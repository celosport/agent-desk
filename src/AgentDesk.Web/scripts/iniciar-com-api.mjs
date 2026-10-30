// Sobe o app Angular quando a API é iniciada pelo Visual Studio / `dotnet run` (SPA Proxy) — [[ADR-003 - Frontend Junto da API (SPA Proxy)]].
// O SPA Proxy abre este processo numa janela própria que FECHA se ele terminar. Por isso, em vez de "sumir",
// aqui checamos o ambiente e, se algo der errado, a janela fica aberta mostrando o motivo.
// Sem dependências: roda antes mesmo do `npm install`.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const URL_API = 'https://localhost:52480';

/** Mesma exigência do Angular CLI 22 (package.json → engines.node: ^22.22.3 || ^24.15.0 || >=26). */
export function nodeCompativel(versao) {
  const [maior, menor, patch] = versao.replace(/^v/, '').split('.').map(Number);
  if (maior >= 26) return true;
  if (maior === 24) return menor >= 15;
  if (maior === 22) return menor > 22 || (menor === 22 && patch >= 3);
  return false;
}

/** Maior versão primeiro ("v24.15.0" antes de "v22.22.3"). */
export function compararVersoes(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  return 0;
}

/** Entre os Node achados no PC, o mais novo que o Angular aceita (ou null). */
export function escolherNode(achados) {
  return achados.filter((n) => nodeCompativel(n.versao)).sort((a, b) => compararVersoes(a.versao, b.versao))[0] ?? null;
}

/**
 * Onde costuma haver outro Node no PC: o PATH inteiro (o Visual Studio põe o Node antigo dele na frente),
 * a instalação padrão, o nvm-windows, o fnm e o Volta.
 */
function caminhosCandidatos() {
  const exe = windows ? 'node.exe' : 'node';
  const env = process.env;
  const lista = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean).map((d) => join(d, exe));
  const pastasDeVersoes = [
    env.NVM_HOME,
    env.NVM_DIR && join(env.NVM_DIR, 'versions', 'node'),
    env.APPDATA && join(env.APPDATA, 'nvm'),
    env.FNM_DIR && join(env.FNM_DIR, 'node-versions'),
    env.APPDATA && join(env.APPDATA, 'fnm', 'node-versions'),
  ];
  if (windows) {
    for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs')])
      if (base) lista.push(join(base, 'nodejs', exe));
    if (env.LOCALAPPDATA) lista.push(join(env.LOCALAPPDATA, 'Volta', 'bin', exe));
  } else {
    lista.push('/usr/local/bin/node', '/opt/homebrew/bin/node');
  }
  for (const pasta of pastasDeVersoes) {
    if (!pasta || !existsSync(pasta)) continue;
    try {
      for (const v of readdirSync(pasta)) lista.push(join(pasta, v, exe), join(pasta, v, 'installation', exe), join(pasta, v, 'bin', exe));
    } catch {
      /* pasta sem permissão: ignora */
    }
  }
  return [...new Set(lista)].filter((c) => c !== process.execPath && existsSync(c));
}

function acharNodeCompativel() {
  const achados = [];
  for (const caminho of caminhosCandidatos()) {
    const r = spawnSync(caminho, ['-v'], { encoding: 'utf8', timeout: 5000 });
    const versao = r.stdout?.trim();
    if (r.status === 0 && /^v\d+\.\d+\.\d+/.test(versao)) achados.push({ caminho, versao });
  }
  return escolherNode(achados);
}

async function falhar(mensagem) {
  console.error(`\n\x1b[31m✖ ${mensagem}\x1b[0m\n`);
  console.error(`A API continua funcionando (Swagger em ${URL_API}/swagger), mas o app não subiu.`);
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((ok) => rl.question('\nPressione Enter para fechar esta janela… ', ok));
    rl.close();
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`AgentDesk — iniciando o app Angular (Node ${process.version})…`);

  if (!nodeCompativel(process.version)) {
    // O Visual Studio costuma rodar o Node antigo que vem com ele. Procura um Node novo no PC e continua com ele.
    const outro = acharNodeCompativel();
    if (!outro) {
      await falhar(
        `Node.js ${process.version} é antigo para o Angular 22 (precisa de 22.22.3+ ou 24.15+) e não achei outro no PC.\n` +
          '  Instale a versão LTS: "winget install OpenJS.NodeJS.LTS" no PowerShell, ou https://nodejs.org\n' +
          '  (com o nvm-windows: "nvm install 24" e "nvm use 24"). Depois aperte F5 de novo.',
      );
    }
    console.log(`Usando o Node ${outro.versao} em ${outro.caminho} (o ${process.version} do PATH é antigo).\n`);
    // O npm e o ng também precisam achar este Node primeiro no PATH
    const env = { ...process.env, PATH: `${dirname(outro.caminho)}${delimiter}${process.env.PATH ?? process.env.Path ?? ''}` };
    if (windows) delete env.Path;
    const filho = spawn(outro.caminho, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { cwd: raiz, stdio: 'inherit', env });
    for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => filho.kill(sinal));
    filho.on('exit', (codigo) => process.exit(codigo ?? 0));
    await new Promise(() => {}); // segue vivo enquanto o filho roda
  }

  const cli = join(raiz, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  if (!existsSync(cli)) {
    console.log('Instalando as dependências do app (npm install) — só na primeira vez…');
    const npm = spawnSync(windows ? 'npm.cmd' : 'npm', ['install'], { cwd: raiz, stdio: 'inherit', shell: windows });
    if (npm.status !== 0 || !existsSync(cli)) await falhar('O "npm install" falhou. Veja as mensagens acima.');
  }

  const versaoCli = JSON.parse(readFileSync(join(raiz, 'node_modules', '@angular', 'cli', 'package.json'), 'utf8')).version;
  console.log(`Angular CLI ${versaoCli} — abrindo http://localhost:4210 (a primeira compilação leva alguns segundos).\n`);

  const ng = spawn(process.execPath, [cli, 'serve', ...process.argv.slice(2)], { cwd: raiz, stdio: 'inherit' });
  ng.on('exit', async (codigo, sinal) => {
    if (sinal || codigo === 0) process.exit(codigo ?? 0);
    await falhar(`O servidor do Angular parou (código ${codigo}). Veja a mensagem acima.`);
  });
}
