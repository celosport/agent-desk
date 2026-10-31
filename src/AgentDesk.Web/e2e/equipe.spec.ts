import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

async function abrirEquipe(page: Page): Promise<void> {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();
  await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Equipe' }).click();
  await expect(page.getByRole('heading', { name: 'Aparência' })).toBeVisible();
}

const agentesAutomacoes = (page: Page) => page.getByRole('list', { name: 'Agentes' }).getByRole('button');

test('personaliza o agente de uma automação, vê o nome nas salas e restaura o padrão', async ({ page }) => {
  await abrirEquipe(page);

  await page.getByLabel('Automação', { exact: true }).selectOption({ label: 'Sumi · Resumir Documento' });
  await page.getByLabel('Nome', { exact: true }).fill('Zeca');
  await page.getByLabel('Acessório').selectOption('COROA');
  await page.getByLabel('Antena').selectOption('DUPLA');
  await page.getByLabel('Expressão').selectOption('FELIZ');
  await expect(page.getByRole('img', { name: 'Pré-visualização de Zeca' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar agente' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Zeca foi salvo.' })).toBeVisible();

  await page.getByRole('tab', { name: 'Automações' }).click();
  await expect(agentesAutomacoes(page).filter({ hasText: 'Zeca' })).toHaveCount(1);
  await expect(agentesAutomacoes(page).filter({ hasText: /^Sumi/ })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Equipe' }).click();
  await page.getByLabel('Automação', { exact: true }).selectOption({ label: 'Zeca · Resumir Documento' });
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Zeca'); // o que foi salvo volta no editor
  await page.getByRole('button', { name: 'Restaurar padrão' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'restaurado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restaurar padrão' })).toBeDisabled();

  await page.getByRole('tab', { name: 'Automações' }).click();
  await expect(agentesAutomacoes(page).filter({ hasText: /^Sumi/ })).toHaveCount(1);
});

test('nome é obrigatório', async ({ page }) => {
  await abrirEquipe(page);

  await page.getByLabel('Nome', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Salvar agente' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Dê um nome ao agente.' })).toBeVisible();
});

test('a equipe de um projeto vale para as sessões, na ordem em que chegam à sala', async ({ page }) => {
  await abrirEquipe(page);

  await page.getByLabel('Tipo de agente').selectOption('PROJETO');
  await page.getByLabel('Projeto', { exact: true }).selectOption({ label: 'app-mobile' });
  await page.getByLabel('Posição na equipe').selectOption('0');
  await page.getByLabel('Nome', { exact: true }).fill('Lia');
  await page.getByRole('button', { name: 'Salvar agente' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Lia foi salvo.' })).toBeVisible();
  await expect(page.getByLabel('Posição na equipe').locator('option').first()).toHaveText('1º · Lia');

  await page.getByRole('tab', { name: 'Claude Code (ao vivo)' }).click();
  await page.getByRole('group', { name: 'Projetos' }).getByRole('button', { name: /app-mobile/ }).click();
  await expect(page.getByRole('list', { name: 'Sessões' }).getByRole('button').filter({ hasText: 'Lia' })).toHaveCount(1);
});

test('"Personalizar" no robô da automação abre o editor já nele', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();
  await page.getByRole('tab', { name: 'Automações' }).click();

  await page.getByRole('list', { name: 'Agentes' }).getByRole('button', { name: /^Bit/ }).click();
  await page.getByRole('button', { name: 'Personalizar Bit' }).click();

  await expect(page.getByRole('heading', { name: 'Aparência' })).toBeVisible();
  await expect(page.getByLabel('Tipo de agente')).toHaveValue('AUTOMACAO');
  await expect(page.getByLabel('Automação', { exact: true })).toHaveValue('analisar-codigo');
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Bit');
});

test('"Personalizar" numa sessão do Claude Code abre a equipe do projeto na posição dela', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();

  await page.getByRole('group', { name: 'Projetos' }).getByRole('button', { name: /app-mobile/ }).click();
  await page.getByRole('list', { name: 'Sessões' }).getByRole('button').nth(1).click(); // a 2ª a chegar à sala: posição 2
  await page.getByRole('button', { name: /^Personalizar / }).click();

  await expect(page.getByRole('heading', { name: 'Aparência' })).toBeVisible();
  await expect(page.getByLabel('Tipo de agente')).toHaveValue('PROJETO');
  await expect(page.getByLabel('Projeto', { exact: true })).toHaveValue('a0b1c2d3e4f5');
  await expect(page.getByLabel('Posição na equipe')).toHaveValue('1');
});
