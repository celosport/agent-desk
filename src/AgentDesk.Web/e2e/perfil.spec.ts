import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

// PNG 1x1 válido
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('mostra quem está logado e abre o perfil pelo avatar', async ({ page }) => {
  await entrarComo(page, 'usuario');

  const avatar = page.getByRole('link', { name: 'Meu perfil: Maria Silva' });
  await expect(avatar).toBeVisible();
  await avatar.click();

  await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();
  const quem = page.getByRole('region', { name: 'Quem está logado' });
  await expect(quem).toContainText('Maria Silva');
  await expect(quem).toContainText('maria@exemplo.com');
});

test('foto: escolhe, ajusta o enquadramento, usa e remove', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('link', { name: 'Meu perfil: Maria Silva' }).click();

  await page.getByLabel('Escolher arquivo da foto').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });

  // Recortador: zoom, giro e confirmação
  await expect(page.getByRole('group', { name: 'Ajustar foto' })).toBeVisible();
  await page.getByRole('slider', { name: 'Zoom' }).fill('2');
  await page.getByRole('button', { name: 'Girar' }).click();
  await page.getByRole('button', { name: 'Usar esta foto' }).click();

  await expect(page.getByText('Foto atualizada.')).toBeVisible({ timeout: 15_000 }); // recortar e codificar a imagem é lento sob carga
  await expect(page.getByRole('link', { name: 'Meu perfil: Maria Silva' }).locator('img')).toBeVisible(); // avatar do topo ganhou a foto

  await page.getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.getByRole('link', { name: 'Meu perfil: Maria Silva' }).locator('img')).toHaveCount(0);
});

test('altera o nome e o topo acompanha', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('link', { name: 'Meu perfil: Maria Silva' }).click();

  await page.getByLabel('Como você quer ser chamado').fill('Maria Souza');
  await page.getByRole('button', { name: 'Salvar nome' }).click();

  await expect(page.getByText('Nome atualizado.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Meu perfil: Maria Souza' })).toBeVisible();
});
