import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

async function abrirAbaClaudeCode(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Consumo' }).click();
  await page.getByRole('tab', { name: 'Claude Code (assinatura)' }).click();
}

test('mostra as barras de 5 horas e da semana, com quando cada janela renova', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await abrirAbaClaudeCode(page);

  const janelas = page.getByRole('region', { name: 'Uso da assinatura' });
  const cinco = janelas.getByRole('progressbar', { name: 'Uso da janela de 5 horas' });
  await expect(cinco).toHaveAttribute('aria-valuenow', '34');
  const semana = janelas.getByRole('progressbar', { name: 'Uso da janela de semana' });
  await expect(semana).toHaveAttribute('aria-valuenow', '92');
  await expect(janelas).toContainText('34% usado');
  await expect(janelas).toContainText(/Renova hoje às \d{2}:\d{2} · em 2 h 1\d min/);
  await expect(janelas).toContainText(/Renova (amanhã|\d{2}\/\d{2}) às/);
});

test('sem leitura da statusline, explica de onde vêm as barras', async ({ page }) => {
  await entrarComo(page, 'admin'); // o mock não dá janelas ao admin: plano sem rate_limits
  await abrirAbaClaudeCode(page);

  const janelas = page.getByRole('region', { name: 'Uso da assinatura' });
  await expect(janelas.getByRole('progressbar')).toHaveCount(0);
  await expect(janelas).toContainText('só existem nos planos Pro/Max');
  await expect(janelas.getByRole('link', { name: 'Ligar a statusline' })).toBeVisible();
});

test('Configurações oferece o comando de atualização, sem token', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();

  await page.getByText('Já conectei antes').click();
  const comando = page.getByTestId('comando-atualizacao');
  await expect(comando).toContainText('agentdesk-coletor.mjs');
  await expect(comando).toContainText('atualizar');
  await expect(comando).not.toContainText('adk_');
});
