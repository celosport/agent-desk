import { expect, type Page } from '@playwright/test';

/** Logins do modo mock (senha livre): e-mail com "admin" = ADMIN, qualquer outro = USUARIO. Ver core/mock. */
export const PERFIS = {
  usuario: { email: 'maria@exemplo.com', area: '/inicio' },
  admin: { email: 'admin@exemplo.com', area: '/inicio' },
} as const;

export async function entrarComo(page: Page, perfil: keyof typeof PERFIS): Promise<void> {
  const { email, area } = PERFIS[perfil];
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('Senha@2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(new RegExp(`${area}$`));
}
