import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

test.describe('Aviso push do admin', () => {
  test('usuário comum não vê o bloco', async ({ page }) => {
    await entrarComo(page, 'usuario');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
    await expect(page.getByRole('heading', { name: 'Alertas no celular' })).toBeVisible();
    await expect(page.getByRole('region', { name: /Avisar usuários/ })).toHaveCount(0);
  });

  test('admin escolhe quem recebe, envia e vê quantos foram alcançados', async ({ page }) => {
    await entrarComo(page, 'admin');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
    const bloco = page.getByRole('region', { name: /Avisar usuários/ });

    await bloco.getByRole('button', { name: 'Enviar aviso' }).click();
    await expect(bloco.getByRole('alert')).toContainText('Escolha pelo menos uma pessoa');

    await bloco.getByRole('checkbox', { name: /Maria Souza/ }).check();
    await bloco.getByRole('checkbox', { name: /João Lima/ }).check();
    await bloco.getByRole('button', { name: 'Enviar aviso' }).click();
    await expect(bloco.getByRole('status')).toContainText('Aviso enviado para 1 de 2 pessoas. 1 ainda não ativou os alertas no celular.');

    await bloco.getByRole('button', { name: 'Marcar todos' }).click();
    await bloco.getByRole('button', { name: 'Enviar aviso' }).click();
    await expect(bloco.getByRole('status')).toContainText('3 de 4 pessoas');
  });
});
