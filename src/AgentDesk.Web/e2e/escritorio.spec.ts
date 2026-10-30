import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: a automação responde em ~0,5 s com 1.800 tokens; "[recusar]" simula a recusa da Claude. Ver core/mock.

async function prepararEscritorio(page: Page): Promise<void> {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');
  await page.getByLabel('API key').fill('sk-ant-chave-de-teste-ABCD');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByTestId('chave-mascarada')).toBeVisible();
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();
  await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();
}

const agente = (page: Page, apelido: string) => page.getByRole('list', { name: 'Agentes' }).getByRole('button', { name: new RegExp(apelido) });

test('cada automação é um robô; ao trabalhar ele pensa e mostra tokens e custo', async ({ page }) => {
  await prepararEscritorio(page);
  await expect(page.getByRole('list', { name: 'Agentes' }).getByRole('button')).toHaveCount(3);
  await expect(page.getByRole('img', { name: /Escritório em pixel art com 3 agentes/ })).toBeVisible();

  // A sala foi desenhada (o canvas não está em branco)
  const cores = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => {
    const dados = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const vistas = new Set<number>();
    for (let i = 0; i < dados.length; i += 400) vistas.add((dados[i] << 16) | (dados[i + 1] << 8) | dados[i + 2]);
    return vistas.size;
  });
  expect(cores).toBeGreaterThan(8);

  await agente(page, 'Sumi').click();
  await page.getByLabel(/Pedido para Sumi/).fill('Resuma a ata da reunião');
  await page.getByRole('button', { name: 'Mandar Sumi trabalhar' }).click();

  await expect(agente(page, 'Sumi')).toContainText(/indo para a mesa|pensando/);
  await expect(page.getByRole('button', { name: 'Sumi está trabalhando…' })).toBeDisabled();
  await expect(agente(page, 'Sumi')).toContainText('terminou: 1.800 tokens · US$ 0,0004', { timeout: 10_000 });
  await expect(page.locator('[data-agente="resumir-documento"]')).toHaveText('1.800 tokens · US$ 0,0004');
  await expect(agente(page, 'Rel')).toContainText('disponível'); // os outros não se mexeram
  await expect(page.getByRole('link', { name: 'Ver o resultado completo no histórico' })).toBeVisible();
});

test('com movimento reduzido o robô não anda: aparece pensando na mesa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepararEscritorio(page);

  await agente(page, 'Rel').click();
  await page.getByLabel(/Pedido para Rel/).fill('Números do trimestre');
  await page.getByRole('button', { name: 'Mandar Rel trabalhar' }).click();

  await expect(agente(page, 'Rel')).toContainText('pensando…'); // sem passar por "indo para a mesa"
  await expect(page.locator('[data-agente="relatorio-executivo"]')).toContainText('pensando');
  await expect(agente(page, 'Rel')).toContainText('terminou: 1.800 tokens · US$ 0,0145');
});

test('erro aparece no balão do robô e, sem chave, leva para Configurações', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();

  await agente(page, 'Bit').click();
  await page.getByLabel(/Pedido para Bit/).fill('function x() {}');
  await page.getByRole('button', { name: 'Mandar Bit trabalhar' }).click();

  await expect(page.getByRole('alert')).toContainText('Cadastre a sua API key');
  await expect(agente(page, 'Bit')).toContainText('erro: Cadastre a sua API key', { timeout: 10_000 });
  await page.getByRole('link', { name: 'Ir para Configurações' }).click();
  await expect(page).toHaveURL(/\/configuracoes$/);
});

test('clicar num robô na sala seleciona a automação dele', async ({ page }) => {
  await prepararEscritorio(page);
  await expect(agente(page, 'Rel')).toHaveAttribute('aria-pressed', 'true');

  // Bit fica no canto (1, 6): acha o ponto dele no canvas pelo motor e clica
  const canvas = page.locator('canvas');
  const caixa = (await canvas.boundingBox())!;
  const escala = caixa.width / 272; // CENA_L
  const pe = { x: 272 / 2 + (1 - 6) * 16, y: 56 + 24 + (1 + 6) * 8 + 8 }; // centroNaTela({ x: 1, y: 6 })
  await canvas.click({ position: { x: pe.x * escala, y: (pe.y - 12) * escala } });

  await expect(agente(page, 'Bit')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Pedido para Bit/)).toBeVisible();
});
