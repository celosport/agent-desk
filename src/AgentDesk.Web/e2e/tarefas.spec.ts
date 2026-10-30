import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

test('cria e conclui uma tarefa', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('link', { name: 'Tarefas', exact: true }).click();

  const pendentes = page.getByRole('list', { name: 'Tarefas pendentes' });
  await expect(pendentes.getByRole('listitem')).toHaveCount(2);

  await page.getByLabel('Nova tarefa').fill('Escrever o primeiro módulo');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(pendentes.getByText('Escrever o primeiro módulo')).toBeVisible();

  await page.getByRole('button', { name: 'Concluir Escrever o primeiro módulo' }).click();
  await expect(page.getByRole('list', { name: 'Tarefas concluídas' }).getByText('Escrever o primeiro módulo')).toBeVisible();
  await expect(pendentes.getByRole('listitem')).toHaveCount(2);
});
