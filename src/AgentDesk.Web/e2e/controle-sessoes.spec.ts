import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: a sessão "demo-sessao-3" (sala app-mobile) tem um pedido de permissão (Bash: npm test) esperando Aprovar/Negar.

async function abrirSalaClaudeCode(page: Page): Promise<void> {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();
  await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();
}

test('pedido de permissão do Claude Code: aprovar no app tira o pedido da lista', async ({ page }) => {
  await abrirSalaClaudeCode(page);

  const pedidos = page.getByRole('region', { name: /Pedidos de permissão/ });
  await expect(pedidos).toContainText('quer usar');
  await expect(pedidos).toContainText('Bash');
  await expect(pedidos).toContainText('npm test');
  await expect(pedidos).toContainText('Nada é aprovado sozinho');

  await pedidos.getByRole('button', { name: /^Aprovar Bash/ }).click();

  await expect(page.getByRole('region', { name: /Pedidos de permissão/ })).toHaveCount(0);
});

test('negar também resolve o pedido', async ({ page }) => {
  await abrirSalaClaudeCode(page);

  await page.getByRole('button', { name: /^Negar Bash/ }).click();

  await expect(page.getByRole('region', { name: /Pedidos de permissão/ })).toHaveCount(0);
});

test('Parar a sessão selecionada: o pedido fica registrado e o botão some', async ({ page }) => {
  await abrirSalaClaudeCode(page);
  await page.getByRole('group', { name: 'Projetos' }).getByRole('button', { name: /app-mobile/ }).click();
  await page.getByRole('list', { name: 'Sessões' }).getByRole('button').first().click();

  await page.getByRole('button', { name: /^Parar / }).click();

  await expect(page.getByText(/Parada pedida: vale na próxima ferramenta/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Parar / })).toHaveCount(0);
});

test('explica que parar vale na próxima ferramenta e depende do coletor atualizado', async ({ page }) => {
  await abrirSalaClaudeCode(page);
  await page.getByRole('list', { name: 'Sessões' }).getByRole('button').first().click();

  await expect(page.getByText(/Parar interrompe o Claude Code na próxima ferramenta/)).toBeVisible();
});
