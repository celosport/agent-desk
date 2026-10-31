import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

async function abrirAba(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Consumo' }).click();
  await expect(page.getByRole('heading', { name: 'Consumo', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Claude Code (assinatura)' }).click();
}

test('aba Claude Code: totais, rankings com cache, ferramentas e cache por dia', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await abrirAba(page);

  await expect(page.getByRole('article', { name: 'Claude Code · Acumulado' })).toContainText('≈ US$ 151,60');
  await expect(page.getByRole('article', { name: 'Claude Code · Este mês' })).toContainText('210 pedidos');

  // Ranking por projeto: o app-mobile tem cache baixo e vem destacado; o outro não
  const projetos = page.getByRole('region', { name: /Ranking por projeto/ });
  await expect(projetos.getByRole('listitem').filter({ hasText: 'app-mobile' })).toContainText('(baixo)');
  await expect(projetos.getByRole('listitem').filter({ hasText: 'api-pagamentos' })).not.toContainText('(baixo)');
  await expect(page.getByRole('region', { name: /Ranking por modelo/ })).toContainText('claude-opus-5-5');

  await expect(page.getByRole('region', { name: 'Ferramentas mais usadas' })).toContainText('Read');
  await expect(page.getByRole('region', { name: 'Ferramentas mais usadas' })).toContainText('não há rateio de tokens');
  await expect(page.getByRole('region', { name: 'Cache por dia' }).getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cache por dia' })).toContainText('⚠');
});

test('ADMIN alterna entre Meu e Todos; usuário comum não vê o seletor', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await abrirAba(page);
  await expect(page.getByRole('button', { name: 'Todos os usuários' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sair' }).click();
  await entrarComo(page, 'admin');
  await abrirAba(page);
  await expect(page.getByRole('article', { name: 'Claude Code · Acumulado' })).toContainText('≈ US$ 151,60');
  await page.getByRole('button', { name: 'Todos os usuários' }).click();
  await expect(page.getByRole('article', { name: 'Claude Code · Acumulado' })).toContainText('≈ US$ 303,20');
});
