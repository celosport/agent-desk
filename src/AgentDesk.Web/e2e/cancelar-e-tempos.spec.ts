import { expect, test, type Page } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: a automação responde em ~0,4 s (1.234 ms de duração); "[lento]" na entrada segura a resposta até o Cancelar (ou 8 s).

async function prepararEscritorio(page: Page): Promise<void> {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');
  await page.getByLabel('API key').fill('sk-ant-chave-de-teste-ABCD');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByTestId('chave-mascarada')).toBeVisible();
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();
  await page.getByRole('tab', { name: 'Automações' }).click();
}

const agente = (page: Page, apelido: string) => page.getByRole('list', { name: 'Agentes' }).getByRole('button', { name: new RegExp(apelido) });
/** Pelo menu (page.goto recarregaria o app e o mock voltaria aos dados de exemplo). */
async function irParaHistorico(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Consumo' }).click();
  await page.getByRole('link', { name: 'Ver histórico' }).click();
}

const HORA = /\d{2}:\d{2}:\d{2}/;

test('mostra quem está logado, com o perfil', async ({ page }) => {
  await entrarComo(page, 'usuario');
  const quem = page.getByLabel('Usuário logado');
  await expect(quem).toContainText('Maria Silva');
  await expect(quem).toContainText('Usuário');

  await page.getByRole('button', { name: 'Sair' }).click();
  await entrarComo(page, 'admin');
  await expect(page.getByLabel('Usuário logado')).toContainText('Administrador');
});

test('cancela a tarefa do agente: cronômetro, balão "cancelada" e a chamada no histórico', async ({ page }) => {
  await prepararEscritorio(page);
  await agente(page, 'Sumi').click();
  await page.getByLabel(/Pedido para Sumi/).fill('Resuma a ata [lento]');
  await page.getByRole('button', { name: 'Mandar Sumi trabalhar' }).click();

  await expect(page.getByRole('timer')).toContainText(/Sumi trabalha há \d+(,\d)? s/);
  await page.getByRole('button', { name: 'Cancelar a tarefa de Sumi' }).click();

  await expect(agente(page, 'Sumi')).toContainText('erro: Execução cancelada');
  await expect(page.getByRole('alert')).toHaveCount(0); // cancelar não é falha
  await expect(page.getByRole('button', { name: 'Mandar Sumi trabalhar' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Cancelar a tarefa/ })).toHaveCount(0);

  await irParaHistorico(page);
  const linha = page.getByRole('row').filter({ hasText: 'Cancelada' });
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText(new RegExp(`${HORA.source} → ${HORA.source}`));
});

test('mostra início, fim e duração da última execução e no histórico', async ({ page }) => {
  await prepararEscritorio(page);
  await agente(page, 'Rel').click();
  await page.getByLabel(/Pedido para Rel/).fill('Números do trimestre');
  await page.getByRole('button', { name: 'Mandar Rel trabalhar' }).click();

  await expect(page.getByTestId('ultima-execucao')).toHaveText(new RegExp(`Última execução: ${HORA.source} → ${HORA.source} · 1 s`), { timeout: 10_000 });

  await irParaHistorico(page);
  await expect(page.getByRole('row').filter({ hasText: 'Sucesso' }).first()).toContainText(new RegExp(`1,2 s${HORA.source} → ${HORA.source}`));
});
