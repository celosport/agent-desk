// Servidor estático mínimo para os testes E2E (sem dependências): serve o build `e2e`
// (produção + service worker + API mock) com fallback de SPA para index.html — igual à API em produção.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const raiz = resolve(process.argv[2] ?? 'dist/e2e/browser');
const porta = Number(process.argv[3] ?? 4300);
const tipos = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

if (!existsSync(join(raiz, 'index.html'))) {
  console.error(`Build não encontrado em ${raiz}. Rode "npm run build:e2e".`);
  process.exit(1);
}

createServer((req, res) => {
  const caminho = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let arquivo = normalize(join(raiz, caminho));
  if (!arquivo.startsWith(raiz)) { res.writeHead(403).end(); return; }
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) {
    if (extname(caminho)) { res.writeHead(404).end(); return; }
    arquivo = join(raiz, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': tipos[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(arquivo).pipe(res);
}).listen(porta, '127.0.0.1', () => console.log(`E2E: servindo ${raiz} em http://127.0.0.1:${porta}`));
