import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: duas salas de demonstração ("app-mobile" com 3 sessões e "api-pagamentos" com 1); uma sessão do app-mobile fica sempre
// "precisando de você". Movimento reduzido: o robô aparece direto na mesa (sem esperar a caminhada). Ver core/mock.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('o Escritório abre nas sessões do Claude Code, na sala que precisa de você', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();

  await expect(page.getByRole('tab', { name: 'Claude Code (ao vivo)' })).toHaveAttribute('aria-selected', 'true');
  const projetos = page.getByRole('group', { name: 'Projetos' });
  await expect(projetos.getByRole('button')).toHaveCount(2);
  await expect(projetos.getByRole('button', { name: /app-mobile · 3 ✋/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '1 sessão(ões) precisam de você' })).toBeVisible();

  const sessoes = page.getByRole('list', { name: 'Sessões' });
  await expect(sessoes.getByRole('button')).toHaveCount(3);
  await expect(sessoes).toContainText('✋ Precisa de você: aprovar permissão');
  await expect(sessoes).toContainText('≈ US$');
  await expect(page.locator('[data-agente="demo-sessao-2"]')).toContainText('Precisa de você'); // balão na sala
  await expect(page.getByRole('img', { name: /Sala app-mobile com 3 sessões/ })).toBeVisible();

  await projetos.getByRole('button', { name: /api-pagamentos/ }).click();
  await expect(page.getByRole('heading', { name: 'Sessões em api-pagamentos' })).toBeVisible();
  await expect(sessoes.getByRole('button')).toHaveCount(1);
});

test('conectar o Claude Code: gera token, mostra o comando uma vez e revoga', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');
  const secao = page.getByRole('region', { name: 'Claude Code' }).or(page.locator('#claude-code'));

  await page.getByLabel('Nome do computador').fill('Notebook do trabalho');
  await page.getByRole('button', { name: 'Gerar token e comando' }).click();

  const comando = page.getByTestId('comando-instalacao');
  await expect(comando).toContainText('/coletor/agentdesk-coletor.mjs');
  await expect(comando).toContainText('--token "adk_mock');
  await expect(comando).toContainText('--maquina "Notebook do trabalho"');
  await page.getByRole('button', { name: 'macOS / Linux' }).click();
  await expect(comando).toContainText('curl -fsSL');
  await page.getByRole('button', { name: 'Copiar comando' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('instalar --url');

  await page.getByRole('button', { name: 'Já instalei' }).click();
  await expect(comando).toHaveCount(0); // o token não aparece de novo
  const lista = secao.getByRole('list', { name: 'Computadores conectados' });
  await expect(lista).toContainText('Notebook do trabalho');
  await expect(lista).toContainText('ainda sem sinal');

  await page.getByRole('button', { name: 'Revogar Notebook do trabalho' }).click();
  await expect(lista).toContainText('revogado em');
});

test('o coletor é baixado do próprio app', async ({ request }) => {
  const resposta = await request.get('/coletor/agentdesk-coletor.mjs');
  expect(resposta.ok()).toBe(true);
  expect(await resposta.text()).toContain('agentdesk-coletor');
});
