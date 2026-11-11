import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avisos } from '../../core/ui/avisos.service';
import { baixarGuiaParaIa } from '../../shared/util/guia-ia';

/**
 * Ajuda: o guia de uso dentro do app (o que o AgentDesk faz, os dois tipos de gasto, primeiros passos, conectar o Claude Code,
 * controle, como gastar menos e problemas comuns) e o botão do guia em Markdown para a IA conectar o Claude Code.
 * Texto estático: só funcionalidade e uso (nada de arquitetura ou hospedagem).
 */
@Component({
  selector: 'app-ajuda',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina ajuda">
      <h1 class="ui-titulo-pagina">Ajuda</h1>
      <p class="ui-suave">Tudo o que o AgentDesk faz e como usar, em poucos minutos de leitura.</p>

      <nav class="indice" aria-label="Neste guia">
        <a routerLink="." fragment="oque">O que é</a>
        <a routerLink="." fragment="gastos">Dois tipos de gasto</a>
        <a routerLink="." fragment="comecar">Primeiros passos</a>
        <a routerLink="." fragment="automacoes">Automações</a>
        <a routerLink="." fragment="escritorio">Escritório</a>
        <a routerLink="." fragment="claude-code">Conectar o Claude Code</a>
        <a routerLink="." fragment="controle">Parar, aprovar, tarefas</a>
        <a routerLink="." fragment="economizar">Gastar menos</a>
        <a routerLink="." fragment="privacidade">Privacidade</a>
        <a routerLink="." fragment="problemas">Problemas comuns</a>
      </nav>

      <section class="ui-cartao" id="oque" aria-labelledby="h-oque">
        <h2 id="h-oque">O que é o AgentDesk</h2>
        <p>Mostra o que os seus agentes estão fazendo agora e quanto cada um gasta. Tem três partes:</p>
        <ul>
          <li><strong>Automações:</strong> tarefas de 1 clique (resumir documento, analisar código, relatório executivo) que usam a Claude com a sua chave.</li>
          <li><strong>Consumo:</strong> tokens e custo de hoje, do mês e acumulado, gráfico por dia, ranking, histórico e limite mensal.</li>
          <li><strong>Escritório:</strong> cada automação e cada sessão do Claude Code vira um robô numa sala. Você vê quem trabalha e quem espera por você.</li>
        </ul>
      </section>

      <section class="ui-cartao" id="gastos" aria-labelledby="h-gastos">
        <h2 id="h-gastos">Dois tipos de gasto (leia primeiro)</h2>
        <div class="rolagem">
          <table>
            <thead><tr><th scope="col"></th><th scope="col">Automações (API)</th><th scope="col">Claude Code (assinatura)</th></tr></thead>
            <tbody>
              <tr><th scope="row">Como funciona</th><td>Você executa uma tarefa no AgentDesk e ele chama a Claude com a <strong>sua chave</strong>.</td><td>Você usa o Claude Code normalmente no computador; o AgentDesk só acompanha.</td></tr>
              <tr><th scope="row">Quem paga</th><td><strong>Dinheiro real</strong>, por token, na conta da sua chave.</td><td>A assinatura (Pro/Max ou da empresa). Não há cobrança por token.</td></tr>
              <tr><th scope="row">Valor mostrado</th><td>Custo calculado pela tabela de preços.</td><td><strong>≈ valor equivalente</strong>: quanto custaria na API. Serve para comparar e achar desperdício.</td></tr>
              <tr><th scope="row">O que limita</th><td>O seu <strong>limite mensal</strong>.</td><td>As janelas de <strong>5 horas</strong> e da <strong>semana</strong>.</td></tr>
              <tr><th scope="row">Onde ver</th><td><a routerLink="/consumo">Consumo → Automações (API)</a></td><td><a routerLink="/consumo">Consumo → Claude Code (assinatura)</a></td></tr>
            </tbody>
          </table>
        </div>
        <p class="aviso">O AgentDesk só enxerga o que passa por ele. Chamadas feitas por outro programa com a mesma chave não aparecem. A fatura oficial é a do Console da Anthropic.</p>
      </section>

      <section class="ui-cartao" id="comecar" aria-labelledby="h-comecar">
        <h2 id="h-comecar">Primeiros passos</h2>
        <ol>
          <li>Em <a routerLink="/configuracoes">Configurações</a>, cole a sua chave da Anthropic (<code>sk-ant-...</code>) e clique <strong>Testar chave</strong> (não gasta tokens). Ela fica cifrada e nunca volta para o navegador.</li>
          <li>Escolha o <strong>modelo padrão</strong> e defina o <strong>limite mensal</strong>.</li>
          <li>Escolha a <strong>moeda</strong> (US$, R$, € ou £) no seletor do topo.</li>
          <li>Opcional: instale o app no celular (Adicionar à tela inicial) e ative os <strong>Alertas no celular</strong>.</li>
        </ol>
      </section>

      <section class="ui-cartao" id="automacoes" aria-labelledby="h-automacoes">
        <h2 id="h-automacoes">Automações</h2>
        <p>Em <a routerLink="/automacoes">Automações</a> escolha o fluxo, cole o texto (ou envie um arquivo .txt/.md de até 200 KB), troque o modelo se quiser e clique <strong>Executar</strong>. Dá para <strong>Cancelar</strong> enquanto roda. O resultado mostra tokens, custo e duração, e pode ser copiado ou baixado em .md.</p>
        <ul>
          <li><strong>Resumir Documento</strong> usa o modelo mais barato; <strong>Relatório Executivo</strong> e <strong>Analisar Código</strong> usam um modelo maior.</li>
          <li>O texto enviado não é guardado; o resultado fica no histórico.</li>
          <li>Com o limite mensal estourado e o bloqueio ligado, o AgentDesk avisa e nem chama a Claude.</li>
        </ul>
      </section>

      <section class="ui-cartao" id="escritorio" aria-labelledby="h-escritorio">
        <h2 id="h-escritorio">Escritório</h2>
        <p>Cada projeto do Claude Code é uma sala; cada sessão é um robô (até 8 por sala), e subagentes aparecem como ajudantes. Clique no robô para ver a atividade, o início, a duração, os tokens e o custo equivalente.</p>
        <ul>
          <li><strong>Trabalhando:</strong> processando um pedido ou usando uma ferramenta.</li>
          <li><strong>✋ Esperando você:</strong> pediu permissão ou fez uma pergunta. Fica em destaque e avisa no celular.</li>
          <li><strong>Ociosa:</strong> terminou e espera o próximo pedido. <strong>Encerrada:</strong> some da sala em 15 minutos.</li>
        </ul>
        <p>Na aba <strong>Equipe</strong> você muda nome, cores, acessório, antena e expressão de cada robô.</p>
      </section>

      <section class="ui-cartao" id="claude-code" aria-labelledby="h-cc">
        <h2 id="h-cc">Conectar o Claude Code do seu projeto</h2>
        <p>Conecte o seu computador <strong>uma vez</strong>; vale para todos os projetos que você abrir depois. Precisa de Node 18 ou mais novo e do Claude Code instalado. Não é preciso mudar nada no código do projeto.</p>
        <ol>
          <li>Em <a routerLink="/configuracoes" fragment="claude-code">Configurações → Claude Code</a>, dê um nome ao computador e clique <strong>Gerar token e comando</strong>. O token aparece uma vez só e é pessoal.</li>
          <li>Cole o comando no terminal do computador. Ele guarda um backup do seu <code>~/.claude/settings.json</code> e acrescenta o que precisa sem apagar o que existe.</li>
          <li>Abra uma <strong>sessão nova</strong> do Claude Code na pasta do projeto. O robô aparece no <a routerLink="/escritorio">Escritório</a>.</li>
        </ol>
        <p><strong>Prefere que a IA faça?</strong> Baixe o guia, abra o Claude Code no seu computador e peça: <em>"Leia o CONECTAR-COM-IA.md e conecte o meu Claude Code ao AgentDesk"</em>. Ela pede o token (que você gera no passo 1) e instala.</p>
        <button type="button" class="ui-botao ui-botao--primario" (click)="baixarGuia()">Baixar guia para a IA (.md)</button>
        <p class="ui-suave">Para atualizar o coletor ou remover tudo, veja os comandos em Configurações → Claude Code. Claude Code na nuvem tem um bloco próprio ali.</p>
      </section>

      <section class="ui-cartao" id="controle" aria-labelledby="h-controle">
        <h2 id="h-controle">Parar, aprovar e mandar tarefas</h2>
        <ul>
          <li><strong>Aprovar/Negar:</strong> pedidos de permissão do Claude Code aparecem no Escritório. Sem resposta a tempo, o Claude Code pergunta no terminal; nada é aprovado sozinho.</li>
          <li><strong>Parar:</strong> o botão na sessão selecionada pede ao Claude Code para interromper.</li>
          <li><strong>Mandar tarefa:</strong> no computador, dentro da pasta do projeto, rode <code>node ~/.agentdesk/agentdesk-coletor.mjs liberar</code> e deixe <code>… escutar</code> aberto. No app: Escritório → Claude Code (ao vivo) → Mandar tarefa. Não digite senhas ou chaves no texto.</li>
        </ul>
      </section>

      <section class="ui-cartao" id="economizar" aria-labelledby="h-economizar">
        <h2 id="h-economizar">Como gastar menos</h2>
        <ol>
          <li><strong>Defina o limite mensal.</strong> A 80% aparece o alerta; a 100% as automações param antes de gastar. Comece baixo e suba conforme o uso real.</li>
          <li><strong>Use o modelo certo:</strong> modelos menores para tarefas simples.</li>
          <li><strong>Olhe o <a routerLink="/consumo">Consumo</a> toda semana:</strong> dia fora da curva, ranking, projetos que mais gastam.</li>
          <li><strong>Siga as dicas do Claude Code:</strong> cache baixo, sessão gigante, muitas compactações, modelo caro em trabalho simples, dia fora da curva.</li>
          <li><strong>Acompanhe as barras de 5 horas e da semana</strong> (verde, laranja a partir de 70%, vermelho a partir de 90%).</li>
          <li><strong>Para um teto que ninguém fura</strong>, configure também o limite de gastos no Console da Anthropic e use uma chave por pessoa ou projeto.</li>
        </ol>
        <p class="aviso">Limites do painel: o custo é uma estimativa pela tabela de preços; chamadas de outros programas não aparecem; no Claude Code por assinatura o valor é equivalente, não cobrança.</p>
      </section>

      <section class="ui-cartao" id="privacidade" aria-labelledby="h-priv">
        <h2 id="h-priv">O que sai do seu computador</h2>
        <p><strong>Sai:</strong> nome da pasta do projeto, ferramenta usada, nome do arquivo (sem caminho), as duas primeiras palavras de um comando (sem o que parece segredo), domínio de URL, contagem de tokens e custo.</p>
        <p><strong>Não sai:</strong> código-fonte, texto dos prompts, respostas da Claude, caminhos completos de pastas.</p>
        <p>Sua chave da Anthropic é cifrada. O token do coletor é pessoal: revogue em Configurações quando trocar de computador.</p>
      </section>

      <section class="ui-cartao" id="problemas" aria-labelledby="h-prob">
        <h2 id="h-prob">Problemas comuns</h2>
        <div class="rolagem">
          <table>
            <thead><tr><th scope="col">Sintoma</th><th scope="col">O que fazer</th></tr></thead>
            <tbody>
              <tr><td>Sessão não aparece no Escritório</td><td>Abra uma sessão <strong>nova</strong> depois de instalar; confira a rede até o servidor; veja se o token não foi revogado.</td></tr>
              <tr><td>"Limite mensal atingido"</td><td>Suba o limite em Configurações ou desligue "bloquear ao atingir".</td></tr>
              <tr><td>Chave inválida ou sem crédito</td><td>Confira a chave e o saldo no Console da Anthropic e teste a chave em Configurações.</td></tr>
              <tr><td>Sem barras de 5 h e da semana</td><td>Só planos Pro/Max, depois da primeira resposta da sessão.</td></tr>
              <tr><td>Alerta no celular não ativa</td><td>Precisa de HTTPS; no iPhone, só no app instalado.</td></tr>
              <tr><td>Consumo vazio</td><td>A aba Automações só tem dados depois de rodar uma automação; a do Claude Code, depois de conectar o computador.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  `,
  styles: `
    .ajuda { display: grid; gap: var(--ui-e4); }
    .ajuda section { display: grid; gap: var(--ui-e2); justify-items: start; scroll-margin-top: 5rem; }
    .indice { display: flex; flex-wrap: wrap; gap: var(--ui-e2); }
    .indice a { padding: var(--ui-e1) var(--ui-e3); border: 1px solid var(--ui-linha); border-radius: 999px; text-decoration: none; font-size: var(--ui-t-sm); }
    h2 { font-size: var(--ui-t-lg); }
    ul, ol { margin: 0; padding-left: var(--ui-e5); display: grid; gap: var(--ui-e1); }
    .rolagem { overflow-x: auto; max-width: 100%; }
    table { border-collapse: collapse; width: 100%; font-size: var(--ui-t-sm); }
    th, td { border: 1px solid var(--ui-linha); padding: var(--ui-e2); text-align: left; vertical-align: top; }
    .aviso { padding: var(--ui-e2) var(--ui-e3); border-radius: var(--ui-raio-controle); background: var(--ui-alerta-fundo); }
  `,
})
export class AjudaPage {
  private readonly avisos = inject(Avisos);

  protected async baixarGuia(): Promise<void> {
    if (!(await baixarGuiaParaIa())) this.avisos.mostrar('Não foi possível baixar o guia agora. Tente de novo.', 'erro');
  }
}
