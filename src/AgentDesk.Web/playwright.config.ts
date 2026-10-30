import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta (E2E) — [[Frontend (Angular PWA)]].
 * Rodam contra o build `e2e`: igual ao de produção (otimizado, COM service worker) mas com a API mock —
 * sem backend; cada página começa com os dados de exemplo, então os testes são isolados e paralelos.
 */
const PORTA = 4300;
const CI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run build:e2e && node e2e/servidor-estatico.mjs dist/e2e/browser ${PORTA}`,
    url: `http://127.0.0.1:${PORTA}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
