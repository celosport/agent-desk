import { Routes } from '@angular/router';
import { anonimoGuard, autenticadoGuard } from './core/auth/auth.guards';

/**
 * Todas as telas são lazy (um chunk por feature). Telas públicas ficam fora do shell; as logadas, dentro.
 * Área por perfil: `canActivate: [perfilGuard('ADMIN')]` e `loadChildren` com as rotas da área.
 */
export const routes: Routes = [
  {
    path: 'entrar',
    title: 'Entrar | Agent Desk',
    canActivate: [anonimoGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'cadastro',
    title: 'Criar conta | Agent Desk',
    canActivate: [anonimoGuard],
    loadComponent: () => import('./features/auth/cadastro.page').then((m) => m.CadastroPage),
  },
  {
    path: '',
    canActivate: [autenticadoGuard],
    loadComponent: () => import('./features/shell/shell.component').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      { path: 'inicio', title: 'Início | Agent Desk', loadComponent: () => import('./features/inicio/inicio.page').then((m) => m.InicioPage) },
      { path: 'tarefas', title: 'Tarefas | Agent Desk', loadComponent: () => import('./features/tarefas/tarefas.page').then((m) => m.TarefasPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
