import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

test.describe('Ver como (admin, somente leitura)', () => {
  test('admin entra como um usuário, vê a faixa, não consegue alterar e volta ao seu perfil', async ({ page }) => {
    await entrarComo(page, 'admin');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
    const bloco = page.getByRole('region', { name: 'Ver como um usuário' });

    // Administradores não aparecem na lista; a busca filtra
    await expect(bloco.getByRole('button', { name: /Ver como Admin/ })).toHaveCount(0);
    await bloco.getByLabel('Buscar usuário').fill('ana');
    await expect(bloco.getByRole('button', { name: 'Ver como Maria Souza' })).toHaveCount(0);
    await bloco.getByRole('button', { name: 'Ver como Ana Costa' }).click();

    const faixa = page.getByRole('status').filter({ hasText: 'Você está vendo como' });
    await expect(faixa).toContainText('Ana Costa');
    await expect(faixa).toContainText('somente leitura');
    await expect(page.getByLabel('Usuário logado')).toContainText('Ana Costa');
    await expect(page.getByLabel('Usuário logado')).toContainText('Usuário');
    // Sem as áreas de admin
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
    await expect(page.getByRole('region', { name: 'Ver como um usuário' })).toHaveCount(0);

    // Alterar qualquer coisa é recusado pelo servidor
    await page.getByRole('link', { name: /Meu perfil/ }).click();
    await page.getByLabel('Como você quer ser chamado').fill('Nome trocado pelo admin');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByText(/nada pode ser alterado/)).toBeVisible();

    await faixa.getByRole('button', { name: 'Sair do modo' }).click();
    await expect(faixa).toHaveCount(0);
    await expect(page.getByLabel('Usuário logado')).toContainText('Administrador');
    await expect(page.getByRole('region', { name: 'Ver como um usuário' })).toBeVisible();
  });

  test('usuário comum não vê o bloco nem a faixa', async ({ page }) => {
    await entrarComo(page, 'usuario');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
    await expect(page.getByRole('region', { name: 'Ver como um usuário' })).toHaveCount(0);
    await expect(page.getByText('Você está vendo como')).toHaveCount(0);
  });
});
