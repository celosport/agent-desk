import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

test('Claude Code na nuvem: gera as variáveis do ambiente e o script de preparação', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
  await page.getByLabel('Nome do computador').fill('PulseFit nuvem');
  await page.getByRole('button', { name: 'Gerar token e comando' }).click();

  await page.getByRole('button', { name: 'Nuvem (Claude Code remoto)' }).click();

  const variaveis = page.getByTestId('nuvem-variaveis');
  await expect(variaveis).toContainText('AGENTDESK_URL=');
  await expect(variaveis).toContainText(/AGENTDESK_TOKEN=adk_/);
  await expect(variaveis).toContainText('AGENTDESK_MAQUINA=PulseFit nuvem');
  const script = page.getByTestId('nuvem-script');
  await expect(script).toContainText('$AGENTDESK_URL/coletor/agentdesk-coletor.mjs');
  await expect(script).toContainText('instalar --sem-teste || true');
  await expect(script).not.toContainText('adk_'); // o token só vai nas variáveis
  await expect(page.getByText(/ambiente de nuvem/).first()).toBeVisible();
  await expect(page.getByTestId('comando-instalacao')).toHaveCount(0);

  await page.getByRole('button', { name: 'macOS / Linux' }).click();
  await expect(page.getByTestId('comando-instalacao')).toBeVisible();
});
