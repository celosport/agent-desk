import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

/** Tela inicial depois do login: atalhos para as áreas. */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina">
      <h1 class="ui-titulo-pagina">Olá, {{ auth.primeiroNome() }}</h1>
      <div class="atalhos">
        <section class="ui-cartao">
          <h2>Automações em 1 clique</h2>
          <p class="ui-suave">Relatório executivo, análise de código e resumo de documentos com a Claude.</p>
          <a class="ui-botao ui-botao--primario" routerLink="/automacoes">Abrir Automações</a>
        </section>
        <section class="ui-cartao">
          <h2>Escritório dos agentes</h2>
          <p class="ui-suave">Cada automação é um robô na sala: mande trabalhar e veja ele ir até a mesa, pensar e mostrar o custo.</p>
          <a class="ui-botao" routerLink="/escritorio">Abrir Escritório</a>
        </section>
        <section class="ui-cartao">
          <h2>Consumo e custo</h2>
          <p class="ui-suave">Tokens e US$ do dia, do mês e acumulado, gráfico por dia e o histórico de cada chamada.</p>
          <a class="ui-botao" routerLink="/consumo">Abrir Consumo</a>
        </section>
        <section class="ui-cartao">
          <h2>Chave e limite de gasto</h2>
          <p class="ui-suave">Cadastre a sua API key da Anthropic, escolha o modelo padrão e o limite do mês.</p>
          <a class="ui-botao" routerLink="/configuracoes">Abrir Configurações</a>
        </section>
      </div>
    </main>
  `,
  styles: `
    .atalhos { display: grid; gap: var(--ui-e4); grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); }
    section { display: grid; gap: var(--ui-e3); justify-items: start; align-content: start; }
    h2 { font-size: var(--ui-t-lg); }
  `,
})
export class InicioPage {
  protected readonly auth = inject(AuthStore);
}
