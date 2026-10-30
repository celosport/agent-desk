import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: o resultado é um texto de demonstração; "[recusar]" simula a recusa da Claude. Ver core/mock.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function salvarChave(page: Page): Promise<void> {
  await page.goto('/configuracoes');
  await page.getByLabel('API key').fill('sk-ant-chave-de-teste-ABCD');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByTestId('chave-mascarada')).toBeVisible();
}

/** Navega pelo menu (sem recarregar a página: o mock guarda o estado em memória). */
async function abrirAutomacoes(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Automações' }).click();
  await expect(page.getByRole('heading', { name: 'Automações', level: 1 })).toBeVisible();
}

test('sem API key, a automação explica e leva para Configurações', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await abrirAutomacoes(page);

  await page.getByRole('button', { name: /Resumir Documento/ }).click();
  await page.getByLabel('Texto de entrada').fill('Um documento qualquer.');
  await page.getByRole('button', { name: 'Executar' }).click();

  await expect(page.getByRole('alert')).toContainText('Cadastre a sua API key da Anthropic');
  await page.getByRole('link', { name: 'Ir para Configurações' }).click();
  await expect(page).toHaveURL(/\/configuracoes$/);
});

test('executa, mostra o consumo e permite copiar e baixar o .md', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await salvarChave(page);
  await abrirAutomacoes(page);

  await page.getByRole('button', { name: /Gerar Relatório Executivo/ }).click();
  await expect(page.getByRole('button', { name: /Gerar Relatório Executivo/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Texto de entrada').fill('Vendas subiram 12% no trimestre.');
  await page.getByRole('button', { name: 'Executar' }).click();
  await expect(page.getByRole('button', { name: 'Executando…' })).toBeDisabled();

  await expect(page.getByTestId('resultado')).toContainText('Vendas subiram 12% no trimestre.');
  const metricas = page.getByRole('list', { name: 'Consumo desta execução' }).or(page.getByLabel('Consumo desta execução'));
  await expect(metricas).toContainText('1.800'); // total de tokens
  await expect(metricas).toContainText('US$ 0,01454'); // custo pelo preço do Opus 5.5

  await page.getByRole('button', { name: 'Copiar' }).click();
  await expect(page.getByText('Resultado copiado.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Vendas subiram 12%');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar .md' }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toMatch(/^relatorio-executivo-\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  expect(await readFile(await arquivo.path(), 'utf-8')).toContain('# Gerar Relatório Executivo');
});

test('usa um arquivo .md como entrada e recusa outros formatos', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await salvarChave(page);
  await abrirAutomacoes(page);
  await page.getByRole('button', { name: /Analisar Código/ }).click();

  await page.getByLabel('Ou envie um arquivo (.txt ou .md)').setInputFiles({
    name: 'contrato.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF'),
  });
  await expect(page.getByRole('alert')).toHaveText('Só arquivos .txt ou .md.');

  await page.getByLabel('Ou envie um arquivo (.txt ou .md)').setInputFiles({
    name: 'codigo.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('function soma(a, b) { return a + b }'),
  });
  await expect(page.getByLabel('Texto de entrada')).toHaveValue('function soma(a, b) { return a + b }');
  await expect(page.getByText('codigo.md')).toBeVisible();

  await page.getByLabel('Modelo').selectOption('claude-haiku-5-5');
  await page.getByRole('button', { name: 'Executar' }).click();
  await expect(page.getByTestId('resultado')).toContainText('function soma');
  await expect(page.getByLabel('Consumo desta execução')).toContainText('Claude Haiku 5.5');
});

test('recusa da Claude aparece como erro, sem link para Configurações', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await salvarChave(page);
  await abrirAutomacoes(page);

  await page.getByLabel('Texto de entrada').fill('Pedido [recusar]');
  await page.getByRole('button', { name: 'Executar' }).click();

  await expect(page.getByRole('alert')).toContainText('A Claude recusou este pedido');
  await expect(page.getByRole('link', { name: 'Ir para Configurações' })).toHaveCount(0);
});

test('avisa ao passar de 80% do limite e bloqueia ao atingir', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await salvarChave(page);
  await page.getByLabel('Limite de gasto por mês (US$)').fill('0.02');
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await expect(page.getByText('Preferências salvas.')).toBeVisible();
  await abrirAutomacoes(page);
  await page.getByRole('button', { name: /Gerar Relatório Executivo/ }).click();

  await page.getByLabel('Texto de entrada').fill('primeira');
  await page.getByRole('button', { name: 'Executar' }).click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  await expect(page.getByText(/limite do mês/)).toHaveCount(0); // 72,7%

  await page.getByRole('button', { name: 'Executar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Limite do mês atingido' })).toBeVisible();

  await page.getByRole('button', { name: 'Executar' }).click();
  await expect(page.getByRole('alert')).toContainText('Você atingiu o limite de gasto do mês');
  await expect(page.getByRole('link', { name: 'Ir para Configurações' })).toBeVisible();
});

test('ADMIN edita o fluxo; o usuário comum não vê o botão', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await abrirAutomacoes(page);
  await expect(page.getByRole('button', { name: 'Editar fluxo' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sair' }).click();
  await entrarComo(page, 'admin');
  await abrirAutomacoes(page);
  await page.getByRole('button', { name: /Resumir Documento/ }).click();
  await page.getByRole('button', { name: 'Editar fluxo' }).click();

  await page.getByLabel(/Modelo da mensagem/).fill('Resuma sem o marcador.');
  await page.getByRole('button', { name: 'Salvar fluxo' }).click();
  await expect(page.getByRole('alert')).toContainText('{{entrada}}');

  await page.getByLabel(/Modelo da mensagem/).fill('Resuma em 3 linhas: {{entrada}}');
  await page.getByLabel('Nome', { exact: true }).fill('Resumo Rápido');
  await page.getByRole('button', { name: 'Salvar fluxo' }).click();
  await expect(page.getByText('Fluxo salvo.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Resumo Rápido/ })).toBeVisible();
});
