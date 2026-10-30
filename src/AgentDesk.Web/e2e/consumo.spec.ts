import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: consumo de exemplo nos últimos 20 dias (nenhum hoje) da Maria e de outra usuária; as execuções da sessão entram por cima.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Principal' });

test('painel mostra totais, gráfico de 30 dias e ranking; vira tabela', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await menu(page).getByRole('link', { name: 'Consumo' }).click();
  await expect(page.getByRole('heading', { name: 'Consumo', level: 1 })).toBeVisible();

  await expect(page.getByRole('article', { name: 'Hoje' })).toContainText('0 chamadas');
  await expect(page.getByRole('article', { name: 'Acumulado' })).toContainText('15 chamadas');
  await expect(page.getByRole('group', { name: /Custo por dia/ }).getByRole('img')).toHaveCount(30);
  const ranking = page.getByRole('heading', { name: /Ranking por automação/ }).locator('..').getByRole('listitem');
  await expect(ranking).toHaveCount(3);
  await expect(ranking.first()).toContainText('Analisar Código'); // a mais cara

  // Foco no teclado mostra o tooltip da barra
  await page.getByRole('group', { name: /Custo por dia/ }).getByRole('img').last().focus();
  await expect(page.getByRole('status').filter({ hasText: 'chamada' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Ver como tabela' }).click();
  await expect(page.getByRole('table', { name: /Custo por dia/ }).getByRole('row')).toHaveCount(31); // cabeçalho + 30 dias
});

test('execução de automação entra no painel e no histórico com o resultado', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');
  await page.getByLabel('API key').fill('sk-ant-chave-de-teste-ABCD');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByTestId('chave-mascarada')).toBeVisible();
  await menu(page).getByRole('link', { name: 'Automações' }).click();
  await page.getByLabel('Texto de entrada').fill('Relatório do dia de hoje');
  await page.getByRole('button', { name: 'Executar' }).click();
  await expect(page.getByTestId('resultado')).toBeVisible();

  await menu(page).getByRole('link', { name: 'Consumo' }).click();
  await expect(page.getByRole('article', { name: 'Hoje' })).toContainText('1 chamada');
  await expect(page.getByRole('article', { name: 'Hoje' })).toContainText('US$ 0,0145'); // formato compacto (4 casas)

  await page.getByRole('link', { name: 'Ver histórico' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^\s*16 chamadas ·/ })).toBeVisible();
  await page.getByRole('button', { name: /^Ver resultado de Gerar Relatório Executivo/ }).first().click();
  await expect(page.getByTestId('resultado-historico')).toContainText('Relatório do dia de hoje');
  await page.getByRole('button', { name: 'Copiar' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Relatório do dia de hoje');
});

test('histórico filtra por automação e status e pagina', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.goto('/consumo/historico');
  await expect(page.getByRole('status').filter({ hasText: /^\s*15 chamadas ·/ })).toBeVisible();

  await page.getByLabel('Automação').selectOption({ label: 'Resumir Documento' });
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^\s*3 chamadas ·/ })).toBeVisible(); // 3 da Maria (3 são da Joana)
  await expect(page.getByRole('table', { name: 'Chamadas' }).getByRole('row')).toHaveCount(4);

  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.getByLabel('Status').selectOption('ERRO');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^\s*1 chamada ·/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Chamadas' })).toContainText('Anthropic.Indisponivel');

  await page.getByRole('button', { name: 'Limpar' }).click();
  await expect(page.getByText('Página 1 de 1')).toBeVisible();
  await page.getByLabel('De', { exact: true }).fill('2026-01-02');
  await page.getByLabel('Até').fill('2026-01-01');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByRole('alert')).toContainText('A data inicial precisa ser anterior');
});

test('ADMIN vê o consumo de todos, com o nome de cada usuário', async ({ page }) => {
  await entrarComo(page, 'admin');
  await menu(page).getByRole('link', { name: 'Consumo' }).click();
  await expect(page.getByRole('article', { name: 'Acumulado' })).toContainText('0 chamadas'); // o ADMIN não rodou nada

  await page.getByRole('button', { name: 'Todos os usuários' }).click();
  await expect(page.getByRole('button', { name: 'Todos os usuários' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article', { name: 'Acumulado' })).toContainText('18 chamadas');

  await page.goto('/consumo/historico');
  await page.getByLabel('De quem').selectOption('TODOS');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByRole('table', { name: 'Chamadas' })).toContainText('Joana Prado');
});
