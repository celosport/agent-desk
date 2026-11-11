import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';

// Mock: duas salas de demonstração ("app-mobile" com 3 sessões e "api-pagamentos" com 1); uma sessão do app-mobile fica sempre
// "precisando de você". Movimento reduzido: o robô aparece direto na mesa (sem esperar a caminhada). Ver core/mock.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('o Escritório abre nas sessões do Claude Code, na sala que precisa de você', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();

  await expect(page.getByRole('tab', { name: 'Claude Code (ao vivo)' })).toHaveAttribute('aria-selected', 'true');
  const projetos = page.getByRole('group', { name: 'Projetos' });
  await expect(projetos.getByRole('button')).toHaveCount(2);
  await expect(projetos.getByRole('button', { name: /app-mobile · 3 ✋/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '1 sessão(ões) precisam de você' })).toBeVisible();

  const sessoes = page.getByRole('list', { name: 'Sessões' });
  await expect(sessoes.getByRole('button')).toHaveCount(3);
  await expect(sessoes).toContainText('✋ Precisa de você: aprovar permissão');
  await expect(sessoes).toContainText('≈ US$');
  await expect(sessoes).toContainText('Tarefa de exemplo 1'); // o título da tarefa (nome da conversa no Claude Code) identifica a sessão
  await expect(page.locator('[data-agente="demo-sessao-2"]')).toContainText('Precisa de você'); // balão na sala
  await expect(page.getByRole('img', { name: /Sala app-mobile com 3 sessões/ })).toBeVisible();

  await projetos.getByRole('button', { name: /api-pagamentos/ }).click();
  await expect(page.getByRole('heading', { name: 'Sessões em api-pagamentos' })).toBeVisible();
  await expect(sessoes.getByRole('button')).toHaveCount(1);
});

test('um subagente aparece como robô ajudante ao lado da sessão que o chamou', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();

  const ajudantes = page.getByRole('list', { name: /^Ajudantes de/ });
  await expect(ajudantes).toHaveCount(1);
  await expect(ajudantes).toContainText('Explore');
  await expect(ajudantes).toContainText('Trabalhando');
  await expect(ajudantes).toContainText('🔎 Procurando “SortMenu”');
  await expect(page.getByText('1 ajudante(s) trabalhando')).toBeVisible();
  await expect(page.locator('[data-agente="sub:demo-sessao-3:demo-ajudante-1"]')).toContainText('Procurando'); // o balão do ajudante na sala
});

test('juntar duas salas num grupo mostra tudo numa sala só, e dá para tirar do grupo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();
  const projetos = page.getByRole('group', { name: 'Projetos' });
  await expect(projetos.getByRole('button')).toHaveCount(2);

  await page.getByText('Juntar salas', { exact: true }).click();
  await page.getByLabel('Juntar com').selectOption({ label: 'api-pagamentos' });
  await page.getByLabel('Nome do grupo').fill('Time de pagamentos');
  await page.getByRole('button', { name: 'Juntar', exact: true }).click();

  await expect(projetos.getByRole('button')).toHaveCount(1);
  await expect(projetos.getByRole('button', { name: /🗂️ Time de pagamentos · 4/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Grupo Time de pagamentos' })).toBeVisible();
  const sessoes = page.getByRole('list', { name: 'Sessões' });
  await expect(sessoes.getByRole('button')).toHaveCount(4); // as 3 de app-mobile + a de api-pagamentos
  await expect(sessoes).toContainText('api-pagamentos'); // cada sessão mostra de qual projeto veio

  await page.getByRole('button', { name: 'Tirar api-pagamentos do grupo' }).click();
  await expect(projetos.getByRole('button')).toHaveCount(2);
  await expect(projetos.getByRole('button', { name: /api-pagamentos · Tarefa de exemplo/ })).toBeVisible();
});

test('mandar tarefa: escolhe computador e pasta, envia e acompanha; pendente dá para cancelar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();

  const enviar = page.getByRole('button', { name: 'Enviar tarefa' });
  await expect(page.getByRole('heading', { name: /Mandar tarefa para o Claude Code/ })).toBeVisible();
  await expect(page.getByLabel('Computador')).toContainText('Notebook · online');
  await expect(page.getByLabel('Pasta do projeto')).toContainText('app-mobile');
  await expect(enviar).toBeDisabled(); // sem texto

  await page.getByLabel('Pasta do projeto').selectOption({ label: 'api-pagamentos' });
  await page.getByLabel('O que o Claude Code deve fazer').fill('Rode os testes e corrija o que falhar.');
  await enviar.click();

  const lista = page.getByRole('list', { name: 'Tarefas enviadas' });
  await expect(lista).toContainText('Rode os testes e corrija o que falhar.');
  await expect(lista).toContainText('api-pagamentos · Notebook');
  await expect(lista).toContainText('Esperando o computador');
  await expect(page.getByLabel('O que o Claude Code deve fazer')).toHaveValue(''); // o texto é limpo depois de enviar
  await expect(lista).toContainText(/Rodando|Concluída/, { timeout: 20_000 }); // o mock avança sozinho (como o coletor faria)

  // Outra tarefa: enquanto está pendente, dá para cancelar
  await page.getByLabel('O que o Claude Code deve fazer').fill('Esta eu vou cancelar');
  await enviar.click();
  await page.getByRole('button', { name: /Cancelar a tarefa: Esta eu vou cancelar/ }).click();
  await expect(lista.getByRole('listitem').filter({ hasText: 'Esta eu vou cancelar' })).toContainText('Cancelada');
});

test('mandar tarefa: pasta não liberada ou limite de 5 mostram o motivo do servidor', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Escritório' }).click();

  const texto = page.getByLabel('O que o Claude Code deve fazer');
  for (let i = 1; i <= 5; i++) {
    await texto.fill(`Tarefa número ${i}`);
    await page.getByRole('button', { name: 'Enviar tarefa' }).click();
    await expect(page.getByRole('list', { name: 'Tarefas enviadas' })).toContainText(`Tarefa número ${i}`);
  }
  await texto.fill('A sexta não cabe');
  await page.getByRole('button', { name: 'Enviar tarefa' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Já há 5 tarefas esperando ou rodando' })).toBeVisible();
  await expect(texto).toHaveValue('A sexta não cabe'); // o que foi digitado não se perde
});

test('baixar o guia em Markdown para a IA, com o endereço do site preenchido', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Baixar guia para a IA/ }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe('CONECTAR-COM-IA.md');
  const texto = await (await import('node:fs/promises')).readFile(await arquivo.path(), 'utf-8');
  expect(texto).toContain('Conectar o meu Claude Code ao AgentDesk');
  expect(texto).not.toContain('{{ENDERECO}}');
});

test('conectar o Claude Code: gera token, mostra o comando uma vez e revoga', async ({ page }) => {
  await entrarComo(page, 'usuario');
  await page.goto('/configuracoes');
  const secao = page.getByRole('region', { name: 'Claude Code' }).or(page.locator('#claude-code'));

  await page.getByLabel('Nome do computador').fill('Notebook do trabalho');
  await page.getByRole('button', { name: 'Gerar token e comando' }).click();

  const comando = page.getByTestId('comando-instalacao');
  await expect(comando).toContainText('/coletor/agentdesk-coletor.mjs');
  await expect(comando).toContainText('--token "adk_mock');
  await expect(comando).toContainText('--maquina "Notebook do trabalho"');
  await page.getByRole('button', { name: 'macOS / Linux' }).click();
  await expect(comando).toContainText('curl -fsSL');
  await page.getByRole('button', { name: 'Copiar comando' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('instalar --url');

  await page.getByRole('button', { name: 'Já instalei' }).click();
  await expect(comando).toHaveCount(0); // o token não aparece de novo
  const lista = secao.getByRole('list', { name: 'Computadores conectados' });
  await expect(lista).toContainText('Notebook do trabalho');
  await expect(lista).toContainText('ainda sem sinal');

  await page.getByRole('button', { name: 'Revogar Notebook do trabalho' }).click();
  await expect(lista).toContainText('revogado em');
});

test('o coletor é baixado do próprio app', async ({ request }) => {
  const resposta = await request.get('/coletor/agentdesk-coletor.mjs');
  expect(resposta.ok()).toBe(true);
  expect(await resposta.text()).toContain('agentdesk-coletor');
});
