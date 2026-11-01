import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

test.describe('Alertas no celular', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, 'usuario');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
  });

  test('ativa os alertas neste aparelho, escolhe o que avisar, testa e desativa', async ({ page }) => {
    const cartao = page.getByRole('region', { name: 'Alertas no celular' });
    await expect(cartao.getByRole('button', { name: 'Ativar alertas neste aparelho' })).toBeVisible();
    await expect(cartao.getByRole('checkbox')).toHaveCount(0); // sem aparelho, nada para configurar

    await cartao.getByRole('button', { name: 'Ativar alertas neste aparelho' }).click();

    await expect(cartao.getByRole('status')).toContainText('Alertas ativos neste aparelho');
    await expect(page.getByText('Alertas ativados neste aparelho.')).toBeVisible();
    const sessoes = cartao.getByRole('checkbox', { name: 'Uma sessão do Claude Code terminar' });
    await expect(sessoes).toBeChecked(); // tudo ligado até desligar
    await expect(cartao.getByRole('checkbox', { name: /automação terminar ou falhar/ })).toBeChecked();
    await expect(cartao.getByRole('checkbox', { name: /pedir permissão/ })).toBeChecked();

    await sessoes.uncheck();
    await cartao.getByRole('button', { name: 'Enviar alerta de teste' }).click();
    await expect(page.getByText(/Alerta de teste enviado/)).toBeVisible();

    // A preferência fica guardada no servidor: sobrevive a sair e voltar para a tela
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Consumo' }).click();
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
    await expect(cartao.getByRole('checkbox', { name: 'Uma sessão do Claude Code terminar' })).not.toBeChecked();

    await cartao.getByRole('button', { name: 'Desativar neste aparelho' }).click();
    await expect(cartao.getByRole('button', { name: 'Ativar alertas neste aparelho' })).toBeVisible();
    await expect(cartao.getByRole('checkbox')).toHaveCount(0);
  });
});
