import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { mensagemDeErro } from '../../core/http/problema';
import { AvisosApi } from './data-access/avisos.api';
import { Destinatario } from './data-access/avisos.models';

/**
 * ADMIN: abre o app como um usuário, só para olhar. A API recusa qualquer alteração nesse modo, o token vale 60 min e cada uso
 * fica registrado. [[ADR-020 - Ver Como (Admin em Somente Leitura)]]
 */
@Component({
  selector: 'app-ver-como-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ui-cartao bloco" aria-labelledby="titulo-ver-como">
      <h2 id="titulo-ver-como">Ver como um usuário</h2>
      <p class="ui-suave">
        Abre o app exatamente como a pessoa vê, <strong>somente leitura</strong>: nada pode ser alterado, o acesso dura 60 minutos e
        cada uso fica registrado. Não vale para administradores.
      </p>

      @if (carregando()) {
        <p class="ui-suave">Carregando…</p>
      } @else {
        <div class="ui-campo">
          <label for="ver-como-busca">Buscar usuário</label>
          <input id="ver-como-busca" class="ui-entrada" type="search" autocomplete="off" placeholder="Nome ou e-mail"
                 [value]="busca()" (input)="busca.set($any($event.target).value)" />
        </div>
        <ul class="lista" aria-label="Usuários para ver como">
          @for (u of filtrados(); track u.usuarioId) {
            <li>
              <span><strong>{{ u.nome }}</strong> <span class="ui-suave">{{ u.email }}</span></span>
              <button type="button" class="ui-botao" [disabled]="entrando() !== null" [attr.aria-label]="'Ver como ' + u.nome" (click)="entrar(u)">
                {{ entrando() === u.usuarioId ? 'Entrando…' : 'Ver como' }}
              </button>
            </li>
          } @empty {
            <li class="ui-suave">Nenhum usuário encontrado.</li>
          }
        </ul>
      }
      @if (erro()) {
        <p class="ui-erro" role="alert">{{ erro() }}</p>
      }
    </section>
  `,
  styles: `
    .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-e3); margin-bottom: var(--ui-e5); }
    h2 { font-size: var(--ui-t-lg); }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-e2); max-height: 18rem; overflow: auto; }
    .lista li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-e2); }
  `,
})
export class VerComoAdmin implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(AvisosApi);

  private readonly usuarios = signal<Destinatario[]>([]);
  protected readonly busca = signal('');
  protected readonly carregando = signal(true);
  protected readonly entrando = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);

  /** Só contas de usuário (a API também recusa administradores). */
  protected readonly filtrados = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    return this.usuarios().filter((u) => !u.ehAdmin && (!termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo)));
  });

  async ngOnInit(): Promise<void> {
    try {
      this.usuarios.set(await this.api.destinatarios());
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async entrar(usuario: Destinatario): Promise<void> {
    this.entrando.set(usuario.usuarioId);
    this.erro.set(null);
    try {
      await this.auth.verComo(usuario.usuarioId);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      this.entrando.set(null);
    }
  }
}
