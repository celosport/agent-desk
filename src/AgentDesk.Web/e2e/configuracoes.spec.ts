import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: o teste da chave responde pelo final ("...INVALIDA" = recusada, "...FORA" = Anthropic fora do ar). Ver core/mock.

test('salva a API key, só mostra a máscara e testa a chave', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await expect(page.getByText('Nenhuma chave salva.')).toBeVisible();

  await page.getByLabel('API key').fill('sk-ant-chave-de-teste-ABCD');
  await page.getByRole('button', { name: 'Salvar chave' }).click();

  await expect(page.getByTestId('chave-mascarada')).toHaveText('sk-ant-...ABCD');
  await expect(page.getByLabel('Trocar a API key')).toHaveValue(''); // a chave digitada não fica na tela
  await expect(page.getByText('sk-ant-chave-de-teste-ABCD')).toHaveCount(0);

  await page.getByRole('button', { name: 'Testar chave' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Chave válida' })).toBeVisible();

  await page.getByRole('button', { name: 'Remover chave' }).click();
  await expect(page.getByText('Nenhuma chave salva.')).toBeVisible();
});

test('mostra o erro da API para chave mal formada e para chave recusada', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');

  await page.getByLabel('API key').fill('chave-errada');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByRole('alert')).toHaveText('A API key da Anthropic começa com "sk-ant-".');

  await page.getByLabel('API key').fill('sk-ant-chave-recusada-INVALIDA');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByTestId('chave-mascarada')).toHaveText('sk-ant-...LIDA');
  await page.getByRole('button', { name: 'Testar chave' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'A Anthropic recusou a chave' })).toBeVisible();

  await page.getByLabel('Trocar a API key').fill('sk-ant-anthropic-fora-do-ar-FORA');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByTestId('chave-mascarada')).toHaveText('sk-ant-...FORA');
  await page.getByRole('button', { name: 'Testar chave' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'A API da Anthropic não respondeu' })).toBeVisible();
});

test('escolhe o modelo padrão e o limite de gasto', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');

  await page.getByLabel('Modelo padrão').selectOption('claude-sonnet-5-5');
  await page.getByLabel('Limite de gasto por mês (US$)').fill('0');
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await expect(page.getByRole('alert')).toContainText('maior que zero');

  await page.getByLabel('Limite de gasto por mês (US$)').fill('25');
  await page.getByLabel(/Bloquear novas automações/).uncheck();
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await expect(page.getByText('Preferências salvas.')).toBeVisible();

  // Usuário comum não vê a tabela de preços para editar
  await expect(page.getByRole('heading', { name: 'Modelos e preços' })).toHaveCount(0);
});

test('ADMIN edita o preço, desativa e adiciona modelo', async ({ page }) => {
  await entrarComo(page, 'admin');
  await page.goto('/configuracoes');
  const tabela = page.getByRole('table', { name: 'Modelos e preços' });
  await expect(tabela.getByRole('row')).toHaveCount(5); // cabeçalho + 4 modelos
  await expect(tabela.getByRole('row').filter({ hasText: 'claude-opus-5-5' })).toContainText('Sim'); // fallback ligado

  await page.getByRole('button', { name: 'Editar Claude Haiku 5.5' }).click();
  await page.getByLabel('Preço de saída').fill('0.75');
  await page.getByLabel('Ativo').uncheck();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  const haiku = tabela.getByRole('row').filter({ hasText: 'claude-haiku-5-5' });
  await expect(haiku).toContainText('0,75');
  await expect(haiku).toContainText('Inativo');
  // Desativado some da escolha de modelo padrão
  await expect(page.getByLabel('Modelo padrão').locator('option', { hasText: 'Claude Haiku 5.5' })).toHaveCount(0);

  await page.getByLabel('Id na API').fill('claude-futuro-6');
  await page.getByLabel('Nome de exibição').fill('Claude Futuro 6');
  await page.getByLabel('Entrada (US$/milhão)').fill('3');
  await page.getByLabel('Saída (US$/milhão)').fill('15');
  await page.getByRole('button', { name: 'Adicionar modelo' }).click();
  await expect(tabela.getByRole('row').filter({ hasText: 'claude-futuro-6' })).toContainText('US$ 15,00');

  await page.getByLabel('Id na API').fill('claude-futuro-6');
  await page.getByLabel('Nome de exibição').fill('Repetido');
  await page.getByLabel('Entrada (US$/milhão)').fill('1');
  await page.getByLabel('Saída (US$/milhão)').fill('1');
  await page.getByRole('button', { name: 'Adicionar modelo' }).click();
  await expect(page.getByRole('alert')).toHaveText('Já existe um modelo com este id.');
});
