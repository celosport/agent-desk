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
      {
        path: 'consumo',
        title: 'Consumo | Agent Desk',
        loadComponent: () => import('./features/consumo/painel.page').then((m) => m.PainelPage),
      },
      {
        path: 'consumo/historico',
        title: 'Histórico de consumo | Agent Desk',
        loadComponent: () => import('./features/consumo/historico.page').then((m) => m.HistoricoPage),
      },
      {
        path: 'consumo/sessoes',
        title: 'Histórico de sessões | Agent Desk',
        loadComponent: () => import('./features/consumo/historico-sessoes.page').then((m) => m.HistoricoSessoesPage),
      },
      {
        path: 'escritorio',
        title: 'Escritório | Agent Desk',
        loadComponent: () => import('./features/escritorio/escritorio.page').then((m) => m.EscritorioPage),
      },
      {
        path: 'configuracoes',
        title: 'Configurações | Agent Desk',
        loadComponent: () => import('./features/configuracoes/configuracoes.page').then((m) => m.ConfiguracoesPage),
      },
      {
        path: 'automacoes',
        title: 'Automações | Agent Desk',
        loadComponent: () => import('./features/automacoes/automacoes.page').then((m) => m.AutomacoesPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
