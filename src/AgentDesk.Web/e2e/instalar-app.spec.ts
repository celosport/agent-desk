import { expect, test } from '@playwright/test';

// `?instalar=botao` (só no build mock) simula o navegador oferecendo a instalação
test.describe('Instalar o app', () => {
  test('cadastro: instala, avisa que pode fechar a aba e segue para a conta', async ({ page }) => {
    await page.goto('/cadastro?instalar=botao');
    await expect(page.getByRole('heading', { name: 'Instale o Agent Desk' })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toHaveCount(0); // primeiro instala, depois cria a conta

    await page.getByRole('button', { name: 'Instalar app' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'instalado' })).toContainText('Agent Desk instalado! Crie sua conta aqui; depois pode fechar esta aba e abrir pelo ícone.');
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await page.getByRole('button', { name: 'Ok' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'instalado' })).toHaveCount(0);
  });

  test('cadastro: "Já instalei" também leva ao formulário', async ({ page }) => {
    await page.goto('/cadastro?instalar=botao');
    await page.getByRole('button', { name: /Já instalei/ }).click();
    await expect(page.getByLabel('E-mail')).toBeVisible();
  });

  test('login: instala e avisa que já pode fechar a aba', async ({ page }) => {
    await page.goto('/entrar?instalar=botao');
    await page.getByRole('button', { name: 'Instalar app' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'instalado' })).toContainText('Já pode fechar esta aba e abrir o Agent Desk pelo ícone na tela inicial.');
  });

  test('computador sem oferta de instalação: o cadastro abre direto', async ({ page }) => {
    await page.goto('/cadastro');
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Instale o Agent Desk' })).toHaveCount(0);
  });
});

test('notebook: mesmo com o evento de instalação do Chrome, nada de "Instale o app" nem de "pode fechar a aba"', async ({ page, isMobile }) => {
  test.skip(isMobile, 'vale para o navegador de computador');
  await page.goto('/cadastro');
  await page.evaluate(() => {
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'accepted' }) }));
    window.dispatchEvent(new Event('appinstalled'));
  });
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Instale o Agent Desk' })).toHaveCount(0);
  await expect(page.getByText(/pode fechar esta aba/)).toHaveCount(0);
});
