import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: a Maria tem consumo de automações (15 chamadas) e sessões do Claude Code; a chave ainda não está cadastrada.

const menu = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Principal' });

test('Início é um painel: números, agora no Claude Code, gráficos, ranking e primeiros passos', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await expect(page.getByRole('heading', { name: 'Olá, Maria' })).toBeVisible();

  const resumo = page.getByRole('region', { name: 'Resumo do dia' });
  await expect(resumo.getByRole('article', { name: 'Automações no mês' })).toBeVisible();
  await expect(resumo.getByRole('article', { name: 'Claude Code hoje' })).toContainText('≈');

  await expect(page.getByRole('region', { name: 'Agora no Claude Code' })).toContainText('esperando por você');
  await expect(page.getByRole('img', { name: /Custo por dia, últimos 14 dias/ })).toHaveCount(2);
  await expect(page.getByRole('region', { name: /Quem mais gasta · automações/ }).getByRole('listitem').first()).toContainText('chamadas'); // ranking dos últimos 14 dias

  // Sem chave cadastrada: "Primeiros passos" aparece, com o passo da chave pendente
  const passos = page.getByRole('region', { name: 'Primeiros passos' });
  await expect(passos).toContainText('Cadastrar a sua chave da Anthropic');
});

test('Primeiros passos some depois de cadastrar a chave (com Claude Code e automações já em uso)', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
  await page.getByLabel('API key').fill('sk-ant-chave-de-teste-ABCD');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await menu(page).getByRole('link', { name: 'Início' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Maria' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Primeiros passos' })).toHaveCount(0);
});

test('o menu leva à Ajuda, que explica os dois tipos de gasto e baixa o guia para a IA', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await menu(page).getByRole('link', { name: 'Ajuda' }).click();
  await expect(page.getByRole('heading', { name: 'Ajuda', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Dois tipos de gasto/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Conectar o Claude Code/ })).toBeVisible();

  // O índice navega pela própria página (sem recarregar o app)
  await page.getByRole('navigation', { name: 'Neste guia' }).getByRole('link', { name: 'Problemas comuns' }).click();
  await expect(page).toHaveURL(/\/ajuda#problemas$/);
  await expect(page.getByRole('heading', { name: 'Problemas comuns' })).toBeInViewport();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Baixar guia para a IA/ }).click();
  expect((await download).suggestedFilename()).toBe('CONECTAR-COM-IA.md');
});

test('Consumo explica as abas e a Ajuda abre no trecho dos dois tipos de gasto', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await menu(page).getByRole('link', { name: 'Consumo' }).click();
  await expect(page.getByText(/dinheiro real/)).toBeVisible();
  await page.getByRole('tab', { name: 'Claude Code (assinatura)' }).click();
  await expect(page.getByText(/valor equivalente, não uma cobrança/)).toBeVisible();
  await page.getByRole('link', { name: 'Entenda a diferença' }).click();
  await expect(page).toHaveURL(/\/ajuda#gastos$/);
});

test('quem não rodou automação mas usa o Claude Code abre o Consumo na aba do Claude Code', async ({ page }) => {
  await entrarComo(page, 'admin'); // no mock o admin não tem chamadas de automação, mas tem o painel do Claude Code
  await menu(page).getByRole('link', { name: 'Consumo' }).click();
  await expect(page.getByRole('tab', { name: 'Claude Code (assinatura)' })).toHaveAttribute('aria-selected', 'true');
});
