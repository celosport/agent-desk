import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

test('sem login, qualquer tela leva para o login', async ({ page }) => {
  await page.goto('/tarefas');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('entra, vê a tela inicial e sai', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await expect(page.getByRole('heading', { name: 'Olá, Maria' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});

test('cadastro mostra o erro da API (e-mail em uso) e depois cria a conta', async ({ page }) => {
  await page.goto('/cadastro');
  await page.getByLabel('Nome').fill('Maria Silva');
  await page.getByLabel('E-mail').fill('maria@exemplo.com');
  await page.getByLabel(/Senha/).fill('Senha@2026');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('alert')).toHaveText('Este e-mail já tem cadastro.');

  await page.getByLabel('Nome').fill('João Souza');
  await page.getByLabel('E-mail').fill('joao@exemplo.com');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, João' })).toBeVisible();
});
