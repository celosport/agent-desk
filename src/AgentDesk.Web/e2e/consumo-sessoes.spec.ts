import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

async function abrirAbaClaudeCode(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Consumo' }).click();
  await page.getByRole('tab', { name: 'Claude Code (assinatura)' }).click();
}

test('dicas automáticas aparecem com a economia estimada e levam ao histórico de sessões', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await abrirAbaClaudeCode(page);

  const dicas = page.getByRole('region', { name: /Dicas para gastar menos/ });
  await expect(dicas.getByRole('listitem')).toHaveCount(3);
  await expect(dicas).toContainText('Cache baixo numa sessão longa');
  await expect(dicas).toContainText('estimativa, não promessa');

  await dicas.getByRole('link', { name: 'Histórico de sessões' }).click();
  await expect(page.getByRole('heading', { name: 'Histórico de sessões', level: 1 })).toBeVisible();
});

test('histórico de sessões: filtra por projeto, pagina e abre a linha do tempo hora a hora', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await abrirAbaClaudeCode(page);
  await page.getByRole('link', { name: 'Histórico de sessões' }).click();

  await expect(page.getByRole('status').filter({ hasText: /sessõ/ })).toContainText('25 sessões nos últimos 90 dias');
  await expect(page.getByRole('row')).toHaveCount(21); // cabeçalho + 20
  await page.getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(6); // cabeçalho + 5

  await page.getByLabel('Projeto').selectOption({ label: 'api-pagamentos' });
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: /sessõ/ })).toContainText('9 sessões');

  await page.getByRole('button', { name: /^Ver linha do tempo de api-pagamentos/ }).first().click();
  const linha = page.getByRole('region', { name: /api-pagamentos ·/ });
  await expect(linha).toContainText('Sessão aberta');
  await expect(linha).toContainText('Read: api.ts');
  await expect(linha).toContainText('Compactou o contexto');
  await expect(linha).not.toContainText('PostToolUse');
  await expect(linha.getByRole('heading', { level: 3 }).first()).toHaveText(/^\d{2}h$/);

  await linha.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('region', { name: /api-pagamentos ·/ })).toHaveCount(0);
});

test('ADMIN vê as sessões de todos, com o nome do usuário', async ({ page }) => {
  await entrarComo(page, 'admin');
  await abrirAbaClaudeCode(page);
  await page.getByRole('link', { name: 'Histórico de sessões' }).click();

  await page.getByRole('button', { name: 'Todos os usuários' }).click();
  await expect(page.getByRole('columnheader', { name: 'Usuário' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Maria Silva' }).first()).toBeVisible();
});
