import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: 1 US$ = 5,40 R$ = 0,90 € = 0,75 £. O painel do Claude Code tem ≈ US$ 151,60 acumulado.

const seletor = (page: Page) => page.getByLabel('Moeda dos valores');
const acumulado = (page: Page) => page.getByRole('article', { name: 'Claude Code · Acumulado' });

async function abrirPainelClaudeCode(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Consumo' }).click();
  await page.getByRole('tab', { name: 'Claude Code (assinatura)' }).click();
}

test('troca a moeda no topo e todos os valores acompanham (151,60 US$ = 818,64 R$ = 136,44 € = 113,70 £)', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await expect(seletor(page).locator('option')).toHaveText(['US$', 'R$', '€', '£']);
  await abrirPainelClaudeCode(page);
  await expect(acumulado(page)).toContainText('≈ US$ 151,60');

  await seletor(page).selectOption('BRL');
  await expect(acumulado(page)).toContainText('≈ R$ 818,64');
  await seletor(page).selectOption('EUR');
  await expect(acumulado(page)).toContainText('≈ € 136,44');
  await seletor(page).selectOption('GBP');
  await expect(acumulado(page)).toContainText('≈ £ 113,70');
  // As dicas e os rankings também são convertidos
  await expect(page.getByRole('region', { name: /Dicas para gastar menos/ })).toContainText('£ 6,30'); // 8,40 US$
});

test('a moeda escolhida fica guardada neste navegador', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await seletor(page).selectOption('BRL');

  await page.reload();

  await expect(seletor(page)).toHaveValue('BRL');
});

test('preços da tabela de modelos e o limite continuam em dólar (são definidos em dólar)', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await seletor(page).selectOption('BRL');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();

  await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
  await expect(page.getByText(/US\$ por milhão de tokens/).first()).toBeAttached();
  await expect(page.locator('main')).not.toContainText('R$');
});

test('o resumo do consumo de automações também é convertido', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Consumo' }).click();
  const mes = page.getByRole('article', { name: 'Este mês' });
  await expect(mes).toContainText('US$');

  await seletor(page).selectOption('EUR');

  await expect(mes).toContainText('€');
  await expect(mes).not.toContainText('US$');
});
